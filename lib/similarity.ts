/**
 * Content-based similarity over LLM-enriched audio features (Phase 3).
 *
 * Represents each track as a small feature vector (energy, valence, danceability,
 * acousticness, instrumental) and provides distance/similarity for:
 *  - the sequencer's transition cost (smoother energy/valence flow), and
 *  - a taste-profile similarity (mean of favourites) available as a future
 *    content scoring term.
 * Purely local — no embedding API.
 */
import type { TrackFeatures } from './db'

export type Vec = number[]
const DIMS = 5

const num = (x: number | null | undefined): number =>
  x == null ? 0.5 : Math.max(0, Math.min(1, x))

/** Build a feature vector, or null if the track has no usable features. */
export function featureVector(f: Partial<TrackFeatures> | null | undefined): Vec | null {
  if (!f) return null
  if (f.energy == null && f.valence == null && f.danceability == null && f.acousticness == null) {
    return null
  }
  return [
    num(f.energy),
    num(f.valence),
    num(f.danceability),
    num(f.acousticness),
    f.instrumental == null ? 0.5 : f.instrumental ? 1 : 0,
  ]
}

function euclidean(a: Vec, b: Vec): number {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    s += d * d
  }
  return Math.sqrt(s)
}

/** Distance in [0,1] (0 = identical sound). */
export function featureDistance(a: Vec, b: Vec): number {
  return Math.min(1, euclidean(a, b) / Math.sqrt(a.length))
}

/** Similarity in [0,1] (1 = identical sound). */
export function similarity(a: Vec, b: Vec): number {
  return 1 - featureDistance(a, b)
}

/** Mean vector — e.g. a taste profile from the user's favourites' features. */
export function meanVector(vectors: Vec[]): Vec | null {
  if (vectors.length === 0) return null
  const out = new Array(DIMS).fill(0)
  for (const v of vectors) for (let i = 0; i < DIMS; i++) out[i] += v[i]
  return out.map((x) => x / vectors.length)
}
