import { NextRequest } from 'next/server'
import { dbExists, getGenreMap, getFeatureVectorMap } from '@/lib/db'
import { recommend, DEFAULT_WEIGHTS } from '@/lib/recommender'
import type { ScoringWeights } from '@/lib/recommender'
import { sequence } from '@/lib/sequencer'
import { featureDistance } from '@/lib/similarity'

export const runtime = 'nodejs'

/**
 * Local, LLM-free playlist generation — the fast path for iterating on
 * recommendation logic and validating the recency/frecency bias against the real
 * synced library. No Anthropic call, no TIDAL round-trip; pure SQLite scoring.
 *
 * GET /api/recommend?limit=20&maxPerArtist=2&favoritesOnly=1&explain=1
 *   &recencyAdd=1.0&playAlltime=1.2&...   (any ScoringWeights key overrides a weight)
 *   &bpm=170&tol=8                        (optional: restrict to run-style BPM windows)
 */
export async function GET(req: NextRequest) {
  if (!dbExists()) {
    return Response.json(
      { error: 'No library synced yet. Run a sync first.' },
      { status: 409 }
    )
  }

  const sp = req.nextUrl.searchParams
  const num = (key: string, fallback: number) => {
    const v = Number(sp.get(key))
    return Number.isFinite(v) && sp.get(key) !== null ? v : fallback
  }

  // Optional run-style BPM windows (half-time, two-thirds, full cadence).
  let bpmRanges: Array<[number, number]> | undefined
  const bpm = Number(sp.get('bpm'))
  if (Number.isFinite(bpm) && bpm > 0) {
    const tol = num('tol', 8)
    const half = Math.round(bpm / 2)
    const twoThirds = Math.round((bpm * 2) / 3)
    bpmRanges = [
      [half - tol, half + tol],
      [twoThirds - tol, twoThirds + tol],
      [bpm - tol, bpm + tol],
    ]
  }

  // Any weight can be overridden via query string for fast A/B testing.
  const weights: Partial<ScoringWeights> = {}
  for (const key of Object.keys(DEFAULT_WEIGHTS) as Array<keyof ScoringWeights>) {
    if (sp.get(key) !== null) weights[key] = num(key, DEFAULT_WEIGHTS[key])
  }

  const explain = sp.get('explain') === '1' || sp.get('explain') === 'true'

  const ranked = recommend({
    limit: num('limit', 20),
    maxPerArtist: num('maxPerArtist', 2),
    favoritesOnly: sp.get('favoritesOnly') === '1' || sp.get('favoritesOnly') === 'true',
    bpmRanges,
    weights,
  })

  // Carry the seq fields (bpm/key) alongside score so we can DJ-sequence the output.
  const enriched = ranked.map(({ track, score, breakdown }) => ({
    ...track,
    score: Number(score.toFixed(4)),
    breakdown,
  }))

  const doSequence = sp.get('sequence') !== '0' && sp.get('sequence') !== 'false'
  const genreMap = doSequence ? getGenreMap() : new Map<string, string>()
  const vecMap = doSequence ? getFeatureVectorMap() : new Map<string, number[]>()
  const ordered = doSequence
    ? sequence(enriched, {
        artistGap: num('artistGap', 3),
        maxStyleRun: num('maxStyleRun', 3),
        styleOf: genreMap.size > 0 ? (t) => genreMap.get(t.id) ?? null : undefined,
        styleDistance:
          vecMap.size > 0
            ? (a, b) => {
                const va = vecMap.get(a.id)
                const vb = vecMap.get(b.id)
                if (va && vb) return featureDistance(va, vb)
                const ga = genreMap.get(a.id)
                const gb = genreMap.get(b.id)
                if (ga && gb) return ga === gb ? 0 : 1
                return 0.5
              }
            : undefined,
      })
    : enriched

  const tracks = ordered.map((t) => ({
    tidal_id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    bpm: t.bpm,
    music_key: t.music_key,
    key_scale: t.key_scale,
    popularity: t.popularity,
    is_favorite: t.is_favorite,
    added_at: t.added_at,
    score: t.score,
    ...(explain ? { breakdown: t.breakdown } : {}),
  }))

  return Response.json({
    count: tracks.length,
    sequenced: doSequence,
    weights: { ...DEFAULT_WEIGHTS, ...weights },
    tracks,
  })
}
