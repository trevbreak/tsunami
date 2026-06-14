import { NextRequest, NextResponse } from 'next/server'
import { dbExists, getTracksByIds } from '@/lib/db'
import { recommend } from '@/lib/recommender'
import { getBatchRecommendations } from '@/lib/tidal'
import type { AlternativesRequest, Track } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_ALTERNATIVES = 5
const BPM_TOL = 8

/**
 * Suggest 3–5 replacement tracks that suit the slot of a track the user is
 * removing.
 *  - run: instant + offline — rank the local library by BPM window around the
 *    removed track's tempo (falls back to the run cadence windows).
 *  - create/enhance: one TIDAL radio call seeded from the removed track + its
 *    neighbours so suggestions match that part of the playlist.
 */
export async function POST(req: NextRequest) {
  const { mode, removedTrackId, neighborIds = [], excludeIds = [], runConfig } =
    (await req.json()) as AlternativesRequest

  const exclude = new Set<string>([...excludeIds, removedTrackId].map(String))

  try {
    if (mode === 'run') {
      const alternatives = runAlternatives(removedTrackId, exclude, runConfig)
      return NextResponse.json({ alternatives })
    }
    const alternatives = await radioAlternatives(removedTrackId, neighborIds, exclude)
    return NextResponse.json({ alternatives })
  } catch (err) {
    return NextResponse.json({ error: String(err), alternatives: [] }, { status: 500 })
  }
}

function runAlternatives(
  removedTrackId: string,
  exclude: Set<string>,
  runConfig?: AlternativesRequest['runConfig']
): Track[] {
  if (!dbExists()) return []

  // Prefer the removed track's own tempo so the replacement holds the slot's feel.
  const removed = getTracksByIds([removedTrackId])[0]
  let bpmRanges: Array<[number, number]>
  if (removed?.bpm != null) {
    bpmRanges = [[removed.bpm - BPM_TOL, removed.bpm + BPM_TOL]]
  } else if (runConfig) {
    const half = Math.round(runConfig.targetBpm / 2)
    const twoThirds = Math.round((runConfig.targetBpm * 2) / 3)
    bpmRanges = [
      [half - BPM_TOL, half + BPM_TOL],
      [twoThirds - BPM_TOL, twoThirds + BPM_TOL],
      [runConfig.targetBpm - BPM_TOL, runConfig.targetBpm + BPM_TOL],
    ]
  } else {
    return []
  }

  return recommend({ bpmRanges, limit: 30, maxPerArtist: 1 })
    .map((s) => s.track)
    .filter((t) => !exclude.has(String(t.id)))
    .slice(0, MAX_ALTERNATIVES)
    .map((t) => ({
      tidal_id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album ?? undefined,
      duration: t.duration ?? undefined,
      cover_url: t.cover_url ?? undefined,
      tidal_url: t.tidal_url ?? undefined,
      reason: t.bpm != null ? `~${t.bpm} BPM — fits the same stride` : 'BPM-matched pick',
    }))
}

async function radioAlternatives(
  removedTrackId: string,
  neighborIds: string[],
  exclude: Set<string>
): Promise<Track[]> {
  const seeds = [removedTrackId, ...neighborIds.slice(0, 2)]
  const { recommendations = [] } = await getBatchRecommendations(seeds, 10)

  const seen = new Set<string>()
  const out: Track[] = []
  for (const r of recommendations) {
    const id = String(r.id)
    if (exclude.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push({
      tidal_id: id,
      title: r.title,
      artist: r.artist,
      album: r.album,
      duration: r.duration,
      cover_url: r.cover_url,
      tidal_url: r.url,
      reason: 'Fits the same vibe',
    })
    if (out.length >= MAX_ALTERNATIVES) break
  }
  return out
}
