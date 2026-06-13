/**
 * Local, LLM-free playlist recommender.
 *
 * Operates entirely over the synced SQLite library so playlists can be generated
 * (and recommendation tweaks A/B-tested) in milliseconds without an LLM round-trip.
 * It biases selection toward:
 *   - tracks added recently to the favourites/"tracks" collection (recency-of-add),
 *   - tracks played a lot and played recently (frecency, via TIDAL history mixes),
 * with global popularity as a weak prior and a small novelty term for exploration.
 *
 * Candidate generation → scoring (this module) → (optional) DJ sequencing (later phase).
 */
import { getRecommenderPool } from './db'
import type { RecommenderRow, CandidateFilter } from './db'

export interface ScoringWeights {
  /** Weight on recency-of-add (favourite saved recently). */
  recencyAdd: number
  /** Flat boost for being in the favourites collection at all. */
  favoriteBoost: number
  /** Play-frequency/recency (frecency) weights, from TIDAL history mixes. */
  playAlltime: number
  playYearly: number
  playMonthly: number
  playRankBonus: number
  /** Weak prior on global TIDAL popularity. */
  popularity: number
  /** Random exploration term (tie-breaking + serendipity). */
  novelty: number

  /** Half-life (days) for the add-recency decay. */
  recencyHalfLifeDays: number
  /** Half-life (favourite rank positions) used when no add timestamp exists. */
  recencyRankHalfLife: number
  /** Decay constant (in months) for monthly-mix recency. */
  monthlyDecayTau: number
}

// Tuned via two rounds of live feedback (see nimbalyst-local/tuning/). Character:
// the user's saved favourites are the spine (favoriteBoost), tilted to recent adds
// (recencyAdd), with listening-history play as reinforcement and strong novelty for
// variety. Popularity is near-zero (the user found popular-driven results off-taste).
export const DEFAULT_WEIGHTS: ScoringWeights = {
  recencyAdd: 3.0,
  favoriteBoost: 2.5,
  playAlltime: 0.8,
  playYearly: 0.8,
  playMonthly: 0.7,
  playRankBonus: 0.6,
  popularity: 0.1,
  novelty: 1.5,
  recencyHalfLifeDays: 120,
  recencyRankHalfLife: 150,
  monthlyDecayTau: 3,
}

export interface ScoreBreakdown {
  recency: number
  favorite: number
  play: number
  popularity: number
  novelty: number
  total: number
}

export interface ScoredTrack {
  track: RecommenderRow
  score: number
  breakdown: ScoreBreakdown
}

const DAY_MS = 86_400_000

/** Recency-of-add: prefer the real timestamp; fall back to favourite rank. */
function recencyOfAdd(row: RecommenderRow, w: ScoringWeights, nowMs: number): number {
  if (row.added_at) {
    const ageDays = Math.max(0, (nowMs - Date.parse(row.added_at)) / DAY_MS)
    return Math.pow(2, -ageDays / w.recencyHalfLifeDays)
  }
  if (row.added_rank != null) {
    return Math.pow(2, -row.added_rank / w.recencyRankHalfLife)
  }
  // Not in the favourites/"tracks" collection → recency-of-add doesn't apply.
  return 0
}

/**
 * Frecency proxy from the history mixes. Multiplicity across monthly mixes
 * accumulates ("played a lot"); the per-month decay rewards recent listening.
 */
function playFrecency(row: RecommenderRow, w: ScoringWeights): number {
  let score = w.playAlltime * (row.in_alltime ? 1 : 0) + w.playYearly * (row.in_yearly ? 1 : 0)

  if (row.monthly_months) {
    for (const part of row.monthly_months.split(',')) {
      const m = Number(part)
      if (Number.isFinite(m) && m >= 0) {
        score += w.playMonthly * Math.exp(-m / w.monthlyDecayTau)
      }
    }
  }

  if (row.best_mix_rank != null && row.best_mix_rank >= 0) {
    score += w.playRankBonus * (1 / (1 + row.best_mix_rank))
  }
  return score
}

export function scoreTrack(
  row: RecommenderRow,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  nowMs: number = Date.now()
): ScoreBreakdown {
  const recency = weights.recencyAdd * recencyOfAdd(row, weights, nowMs)
  const favorite = weights.favoriteBoost * (row.is_favorite ? 1 : 0)
  const play = playFrecency(row, weights)
  const popularity = weights.popularity * ((row.popularity ?? 0) / 100)
  const novelty = weights.novelty * Math.random()
  const total = recency + favorite + play + popularity + novelty
  return { recency, favorite, play, popularity, novelty, total }
}

export interface RecommendOptions extends CandidateFilter {
  /** Number of tracks to return. */
  limit?: number
  weights?: Partial<ScoringWeights>
  /** Cap how many tracks per artist make the final list (diversity). */
  maxPerArtist?: number
  nowMs?: number
}

/**
 * Group key for the same recording across different TIDAL IDs (single vs album vs
 * remaster). ISRC is the international recording identifier; fall back to
 * artist+title when it's missing.
 */
function recordingKey(r: RecommenderRow): string {
  const isrc = r.isrc?.trim()
  return isrc ? `isrc:${isrc}` : `ta:${r.artist.toLowerCase()}|${r.title.toLowerCase()}`
}

/**
 * Merge rows that are the same recording under different IDs, combining their
 * signals so "recently added" (favourite ID) and "played a lot" (history ID)
 * COMPOUND onto one track instead of splitting into duplicates. (NIM-11)
 */
export function mergeByRecording(rows: RecommenderRow[]): RecommenderRow[] {
  const groups = new Map<string, RecommenderRow[]>()
  for (const r of rows) {
    const k = recordingKey(r)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }

  const merged: RecommenderRow[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0])
      continue
    }
    // Prefer the favourite instance as canonical (its ID/title is what the user saved).
    const canonical = group.find((g) => g.is_favorite) ?? group[0]
    const months = new Set<number>()
    let addedAt: string | null = null
    let addedRank: number | null = null
    let inAlltime = 0
    let inYearly = 0
    let isFavorite = 0
    let bestMixRank: number | null = null
    let popularity: number | null = null
    for (const g of group) {
      if (g.added_at && (!addedAt || g.added_at > addedAt)) addedAt = g.added_at // most recent add
      if (g.added_rank != null) addedRank = addedRank == null ? g.added_rank : Math.min(addedRank, g.added_rank)
      inAlltime = Math.max(inAlltime, g.in_alltime)
      inYearly = Math.max(inYearly, g.in_yearly)
      isFavorite = Math.max(isFavorite, g.is_favorite)
      if (g.best_mix_rank != null) bestMixRank = bestMixRank == null ? g.best_mix_rank : Math.min(bestMixRank, g.best_mix_rank)
      if (g.popularity != null) popularity = Math.max(popularity ?? 0, g.popularity)
      if (g.monthly_months) {
        for (const m of g.monthly_months.split(',')) {
          const n = Number(m)
          if (Number.isFinite(n)) months.add(n)
        }
      }
    }
    merged.push({
      ...canonical,
      added_at: addedAt,
      added_rank: addedRank,
      is_favorite: isFavorite,
      in_alltime: inAlltime,
      in_yearly: inYearly,
      monthly_months: months.size ? [...months].sort((a, b) => a - b).join(',') : null,
      best_mix_rank: bestMixRank,
      popularity,
    })
  }
  return merged
}

/** Cap tracks per artist while preserving score order (selection-level diversity). */
function capPerArtist(ranked: ScoredTrack[], maxPerArtist: number): ScoredTrack[] {
  const counts = new Map<string, number>()
  const out: ScoredTrack[] = []
  for (const s of ranked) {
    const key = s.track.artist.toLowerCase()
    const n = counts.get(key) ?? 0
    if (n >= maxPerArtist) continue
    counts.set(key, n + 1)
    out.push(s)
  }
  return out
}

/**
 * Score and rank the library locally. Returns the top `limit` tracks, biased by
 * recency-of-add + play-frecency + popularity, diversified by artist.
 */
export function recommend(options: RecommendOptions = {}): ScoredTrack[] {
  const {
    limit = 20,
    weights: weightOverrides,
    maxPerArtist = 2,
    nowMs = Date.now(),
    ...filter
  } = options
  const weights: ScoringWeights = { ...DEFAULT_WEIGHTS, ...weightOverrides }

  const pool = mergeByRecording(getRecommenderPool(filter))
  const ranked: ScoredTrack[] = pool
    .map((track) => {
      const breakdown = scoreTrack(track, weights, nowMs)
      return { track, score: breakdown.total, breakdown }
    })
    .sort((a, b) => b.score - a.score)

  return capPerArtist(ranked, maxPerArtist).slice(0, limit)
}
