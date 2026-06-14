/**
 * DJ-style playlist sequencing.
 *
 * Orders a chosen set of tracks for smooth flow: minimise the transition cost
 * between adjacent tracks (tempo + harmonic key + style), while spacing the same
 * artist apart and capping how many same-style tracks run back-to-back so small
 * clusters emerge and themes recur instead of one big genre block.
 *
 * Tempo + harmonic work today from synced BPM/key. The style term & run-cap
 * activate once genre enrichment (Phase 2) provides `styleOf`.
 */
import { featureDistance } from './similarity'
import type { Vec } from './similarity'

export interface SeqTrack {
  id: string
  artist: string
  bpm?: number | null
  music_key?: string | null
  key_scale?: string | null
}

export interface SequenceWeights {
  tempo: number
  harmonic: number
  style: number
}

export interface SequenceOptions<T extends SeqTrack> {
  /** Minimum positions between two tracks by the same artist (default 3). */
  artistGap?: number
  /** Max consecutive same-style tracks (default 3). Needs `styleOf`. */
  maxStyleRun?: number
  weights?: Partial<SequenceWeights>
  /** Optional genre/style label; enables run-capping (and style cost if no styleDistance). */
  styleOf?: (t: T) => string | null
  /** Optional continuous style distance in [0,1] (e.g. audio-feature distance). */
  styleDistance?: (a: T, b: T) => number
}

const DEFAULT_WEIGHTS: SequenceWeights = { tempo: 0.5, harmonic: 0.3, style: 0.2 }

// Camelot-wheel number per pitch class (0=C..11=B), for major and minor keys.
const MAJOR_CAMELOT = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1]
const MINOR_CAMELOT = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10]
const BASE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function pitchClass(key: string | null | undefined): number | null {
  if (!key) return null
  const m = key.trim().match(/^([A-G])(Sharp|Flat|#|b)?/i)
  if (!m) return null
  let pc = BASE_PC[m[1].toUpperCase()]
  if (pc == null) return null
  const acc = (m[2] || '').toLowerCase()
  if (acc === 'sharp' || acc === '#') pc += 1
  else if (acc === 'flat' || acc === 'b') pc -= 1
  return ((pc % 12) + 12) % 12
}

function camelot(t: SeqTrack): { num: number; minor: boolean } | null {
  const pc = pitchClass(t.music_key)
  if (pc == null) return null
  const minor = (t.key_scale || '').toUpperCase() === 'MINOR'
  return { num: minor ? MINOR_CAMELOT[pc] : MAJOR_CAMELOT[pc], minor }
}

/** Harmonic distance in [0,1]; 0 = perfect mix. Neutral 0.5 if key unknown. */
function harmonicCost(a: SeqTrack, b: SeqTrack): number {
  const ca = camelot(a)
  const cb = camelot(b)
  if (!ca || !cb) return 0.5
  const raw = Math.abs(ca.num - cb.num)
  const d = Math.min(raw, 12 - raw) // wheel steps 0..6
  const sameMode = ca.minor === cb.minor
  if (d === 0) return sameMode ? 0 : 0.15 // identical / relative major-minor
  if (d === 1 && sameMode) return 0.15 // adjacent on the wheel
  if (d === 1) return 0.4
  return Math.min(1, 0.3 + d / 8)
}

/** Tempo distance in [0,1] with octave (half/double-time) equivalence. */
function tempoCost(a: SeqTrack, b: SeqTrack): number {
  if (!a.bpm || !b.bpm) return 0.5
  let r = a.bpm / b.bpm
  while (r < 0.75) r *= 2
  while (r > 1.5) r /= 2
  return Math.min(1, Math.abs(r - 1) / 0.5)
}

function transitionCost<T extends SeqTrack>(
  a: T,
  b: T,
  w: SequenceWeights,
  styleOf?: (t: T) => string | null,
  styleDistance?: (a: T, b: T) => number
): number {
  let style = 0
  if (styleDistance) {
    style = styleDistance(a, b) // continuous audio-feature distance
  } else if (styleOf) {
    const sa = styleOf(a)
    const sb = styleOf(b)
    if (sa && sb) style = sa === sb ? 0 : 1
  }
  return w.tempo * tempoCost(a, b) + w.harmonic * harmonicCost(a, b) + w.style * style
}

/**
 * Sequence tracks for DJ-style flow. Input order is treated as priority (the
 * first track seeds the walk); returns the same items reordered.
 */
export function sequence<T extends SeqTrack>(tracks: T[], opts: SequenceOptions<T> = {}): T[] {
  if (tracks.length <= 2) return tracks.slice()

  const artistGap = opts.artistGap ?? 3
  const maxStyleRun = opts.maxStyleRun ?? 3
  const w: SequenceWeights = { ...DEFAULT_WEIGHTS, ...opts.weights }
  const styleOf = opts.styleOf

  const remaining = new Set(tracks.map((_, i) => i))
  const order: number[] = [0]
  remaining.delete(0)
  let curIdx = 0

  while (remaining.size > 0) {
    const recentArtists = order
      .slice(-artistGap)
      .map((i) => tracks[i].artist.toLowerCase())

    // Length of the current trailing same-style run.
    let runStyle: string | null = styleOf ? styleOf(tracks[curIdx]) : null
    let runLen = 1
    if (runStyle != null && styleOf) {
      for (let k = order.length - 2; k >= 0; k--) {
        if (styleOf(tracks[order[k]]) === runStyle) runLen++
        else break
      }
    }

    const cur = tracks[curIdx]
    const curArtist = cur.artist.toLowerCase()
    let best = -1
    let bestCost = Infinity
    let nonAdjacent = -1
    let nonAdjacentCost = Infinity
    let relaxed = -1
    let relaxedCost = Infinity

    for (const j of remaining) {
      const cand = tracks[j]
      const cost = transitionCost(cur, cand, w, styleOf, opts.styleDistance)
      if (cost < relaxedCost) {
        relaxedCost = cost
        relaxed = j
      }
      // Lowest-cost candidate that isn't by the immediately-previous artist.
      if (cand.artist.toLowerCase() !== curArtist && cost < nonAdjacentCost) {
        nonAdjacentCost = cost
        nonAdjacent = j
      }
      const artistOk = !recentArtists.includes(cand.artist.toLowerCase())
      const styleOk = !(
        runStyle != null &&
        styleOf &&
        styleOf(cand) === runStyle &&
        runLen >= maxStyleRun
      )
      if (artistOk && styleOk && cost < bestCost) {
        bestCost = cost
        best = j
      }
    }

    // Prefer full artist spacing; if forced to relax, still never place two tracks
    // by the same artist back-to-back unless every remaining track is that artist.
    const pick = best >= 0 ? best : nonAdjacent >= 0 ? nonAdjacent : relaxed
    order.push(pick)
    remaining.delete(pick)
    curIdx = pick
  }

  return order.map((i) => tracks[i])
}

export interface SeqAudio {
  bpm?: number | null
  music_key?: string | null
  key_scale?: string | null
}

/**
 * Sequence tracks that carry a `tidal_id`, looking up tempo/key from a side map
 * (tracks not in the library simply get neutral cost but still respect artist
 * spacing). Returns the original objects reordered.
 */
export function sequenceTidalTracks<T extends { tidal_id: string; artist: string }>(
  tracks: T[],
  audioById: Map<string, SeqAudio>,
  opts: Pick<SequenceOptions<SeqTrack>, 'artistGap' | 'maxStyleRun' | 'weights'> = {},
  genreById?: Map<string, string>,
  featureById?: Map<string, Vec>
): T[] {
  if (tracks.length <= 2) return tracks
  const wrapped = tracks.map((t) => ({
    id: t.tidal_id,
    artist: t.artist,
    ...(audioById.get(t.tidal_id) ?? {}),
  }))
  const styleOf =
    genreById && genreById.size > 0
      ? (w: { id: string }) => genreById.get(w.id) ?? null
      : undefined
  // Prefer continuous audio-feature distance; fall back to genre equality per pair.
  const styleDistance =
    featureById && featureById.size > 0
      ? (a: { id: string }, b: { id: string }) => {
          const va = featureById.get(a.id)
          const vb = featureById.get(b.id)
          if (va && vb) return featureDistance(va, vb)
          const ga = genreById?.get(a.id)
          const gb = genreById?.get(b.id)
          if (ga && gb) return ga === gb ? 0 : 1
          return 0.5
        }
      : undefined
  const ordered = sequence(wrapped, { ...opts, styleOf, styleDistance })
  const byId = new Map(tracks.map((t) => [t.tidal_id, t]))
  return ordered.map((w) => byId.get(w.id)).filter((t): t is T => t != null)
}
