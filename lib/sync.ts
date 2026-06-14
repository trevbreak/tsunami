import {
  upsertTrack,
  upsertPlaylist,
  clearPlaylistTracks,
  addPlaylistTracks,
  setFavorites,
  replaceTrackHistory,
  startSyncLog,
  completeSyncLog,
  getPlaylistSyncState,
  getTracksWithoutBpm,
  updateTrackBpm,
} from './db'
import type { TrackHistoryRow } from './db'
import {
  getUserPlaylists,
  getFavoriteTracks,
  getPlaylistTracks,
  getMixes,
  getMixTracks,
  getListeningHistory,
  enrichBpmBatch,
} from './tidal'
import type { RawTrack } from './tidal'

export type SyncEvent =
  | { type: 'progress'; phase: string; message: string; current?: number; total?: number }
  | { type: 'done'; tracksAdded: number; tracksUpdated: number; durationMs: number }
  | { type: 'error'; message: string }

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms))
}

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const isRateLimit =
        lastError.message.includes('429') ||
        lastError.message.includes('503') ||
        lastError.message.includes('rate')
      if (!isRateLimit && attempt > 0) throw lastError
      const delay = baseDelayMs * Math.pow(2, attempt)
      await sleep(delay)
    }
  }
  throw lastError!
}

function processTrack(raw: RawTrack): 'inserted' | 'updated' {
  return upsertTrack({
    id: raw.id,
    title: raw.title,
    artist: raw.artist,
    album: raw.album,
    duration: raw.duration,
    bpm: raw.bpm,
    cover_url: raw.cover_url,
    tidal_url: raw.url,
    isrc: raw.isrc,
    popularity: raw.popularity,
    explicit: raw.explicit,
    audio_quality: raw.audio_quality,
    release_date: raw.release_date,
    music_key: raw.key,
    key_scale: raw.key_scale,
    album_id: raw.album_id,
    artist_id: raw.artist_id,
    copyright: raw.copyright,
  })
}

async function syncPlaylistTracks(
  playlistId: string,
  totalTracks: number,
  onProgress: (current: number, total: number) => void
): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0
  const trackRefs: Array<{ id: string; position: number }> = []

  clearPlaylistTracks(playlistId)

  // The backend paginates internally and ignores an app-supplied offset, so we
  // fetch the whole playlist in one high-limit call rather than an offset loop
  // (the old loop re-fetched page 1 forever and never terminated).
  const { tracks } = await fetchWithRetry(() => getPlaylistTracks(playlistId, 10000))

  tracks.forEach((raw, i) => {
    const result = processTrack(raw)
    if (result === 'inserted') added++
    else updated++
    trackRefs.push({ id: raw.id, position: i })
  })

  onProgress(tracks.length, totalTracks || tracks.length)
  addPlaylistTracks(playlistId, trackRefs)
  return { added, updated }
}

async function syncFavorites(
  emit: (event: SyncEvent) => void
): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0

  emit({ type: 'progress', phase: 'favorites', message: 'Syncing favourite tracks…' })

  // One high-limit call — the backend paginates internally and returns favourites
  // date-added DESCENDING, so array position == rank (0 = most recently added).
  // (The old offset loop never terminated because the backend ignores offset.)
  const { tracks } = await fetchWithRetry(() => getFavoriteTracks(10000))

  const favorites = tracks.map((raw, i) => {
    const result = processTrack(raw)
    if (result === 'inserted') added++
    else updated++
    return { id: raw.id, added_at: raw.date_added ?? null, rank: i }
  })

  setFavorites(favorites)
  emit({
    type: 'progress',
    phase: 'favorites',
    message: `Synced ${favorites.length} favourites`,
    current: favorites.length,
  })
  return { added, updated }
}

/**
 * Sync the user's listening-history mixes (HISTORY_* surfaces) into track_history.
 * This is the native play-frequency/recency signal: a track's tier(s), how many
 * monthly mixes it recurs in, and its rank within each mix. Best-effort.
 */
async function syncHistory(
  emit: (event: SyncEvent) => void
): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0

  emit({ type: 'progress', phase: 'history', message: 'Reading your listening history…' })

  const { history_mixes, warning } = await fetchWithRetry(() => getListeningHistory())
  if (warning || history_mixes.length === 0) {
    emit({
      type: 'progress',
      phase: 'history',
      message: warning ? `Listening history: ${warning}` : 'No listening-history mixes available.',
    })
    return { added: 0, updated: 0 }
  }

  const rows: TrackHistoryRow[] = []

  for (const mix of history_mixes) {
    try {
      const { tracks } = await fetchWithRetry(() => getMixTracks(mix.id, 300))
      tracks.forEach((raw, i) => {
        const result = processTrack(raw)
        if (result === 'inserted') added++
        else updated++
        rows.push({
          trackId: raw.id,
          tier: mix.tier,
          monthIndex: mix.month_index,
          rank: i,
        })
      })
      emit({
        type: 'progress',
        phase: 'history',
        message: `History: ${mix.tier}${mix.month_index != null && mix.month_index >= 0 ? ` (#${mix.month_index})` : ''} — ${tracks.length} tracks`,
      })
    } catch (e) {
      emit({
        type: 'progress',
        phase: 'history',
        message: `Skipped history mix ${mix.id}: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
    await sleep(150)
  }

  replaceTrackHistory(rows)
  return { added, updated }
}

async function syncMixes(
  emit: (event: SyncEvent) => void
): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0

  emit({ type: 'progress', phase: 'mixes', message: 'Fetching TIDAL mixes…' })

  const { mixes, warning } = await fetchWithRetry(() => getMixes())

  if (warning) {
    emit({ type: 'progress', phase: 'mixes', message: `Mixes: ${warning}` })
    return { added: 0, updated: 0 }
  }

  for (const mix of mixes) {
    upsertPlaylist({
      id: mix.id,
      title: mix.title,
      description: mix.sub_title,
      track_count: mix.track_count,
    })

    emit({
      type: 'progress',
      phase: 'mixes',
      message: `Syncing mix: ${mix.title}`,
    })

    try {
      const { tracks } = await fetchWithRetry(() => getMixTracks(mix.id, 100))
      const trackRefs: Array<{ id: string; position: number }> = []

      clearPlaylistTracks(mix.id)

      for (let i = 0; i < tracks.length; i++) {
        const result = processTrack(tracks[i])
        if (result === 'inserted') added++
        else updated++
        trackRefs.push({ id: tracks[i].id, position: i })
      }

      addPlaylistTracks(mix.id, trackRefs)
    } catch (e) {
      emit({
        type: 'progress',
        phase: 'mixes',
        message: `Skipped mix ${mix.title}: ${e instanceof Error ? e.message : String(e)}`,
      })
    }

    await sleep(200)
  }

  return { added, updated }
}

export async function runBpmEnrichment(
  emit: (event: SyncEvent) => void
): Promise<{ analyzed: number; failed: number }> {
  const tracks = getTracksWithoutBpm()
  if (tracks.length === 0) {
    emit({ type: 'progress', phase: 'bpm', message: 'All tracks already have BPM data.' })
    return { analyzed: 0, failed: 0 }
  }

  emit({
    type: 'progress',
    phase: 'bpm',
    message: `Analysing BPM for ${tracks.length} tracks — this runs once and may take ~${Math.ceil(tracks.length * 2.5 / 60)} minutes…`,
    current: 0,
    total: tracks.length,
  })

  const trackIds = tracks.map((t) => t.id)
  let analyzed = 0
  let failed = 0

  for await (const event of enrichBpmBatch(trackIds)) {
    if (event.done) {
      analyzed = event.analyzed
      failed = event.failed
      emit({
        type: 'progress',
        phase: 'bpm',
        message: `BPM analysis complete: ${analyzed} analysed, ${failed} skipped`,
        current: event.total,
        total: event.total,
      })
    } else {
      if (event.bpm !== null) {
        updateTrackBpm(event.trackId, event.bpm)
      }
      // Emit on every track so the UI can show smooth progress + a live ETA
      emit({
        type: 'progress',
        phase: 'bpm',
        message: `Analysing BPM… ${event.analyzed}/${event.total}`,
        current: event.analyzed,
        total: event.total,
      })
    }
  }

  return { analyzed, failed }
}

/**
 * Lightweight sync that populates ONLY the data the local recommender needs —
 * favourites (with add-dates/rank) and the listening-history mixes — skipping the
 * slow playlist crawl, mixes, and BPM enrichment. Seconds, not minutes. Ideal for
 * tuning iterations and as a fallback when a full sync stalls on playlists.
 */
export async function runQuickSync(
  emit: (event: SyncEvent) => void
): Promise<void> {
  const startedAt = Date.now()
  const logId = startSyncLog('quick')
  let totalAdded = 0
  let totalUpdated = 0

  try {
    emit({
      type: 'progress',
      phase: 'quick',
      message: 'Quick sync: favourites + listening history only…',
    })

    const favStats = await syncFavorites(emit)
    totalAdded += favStats.added
    totalUpdated += favStats.updated

    const historyStats = await syncHistory(emit)
    totalAdded += historyStats.added
    totalUpdated += historyStats.updated

    completeSyncLog(logId, { tracksAdded: totalAdded, tracksUpdated: totalUpdated })
    emit({
      type: 'done',
      tracksAdded: totalAdded,
      tracksUpdated: totalUpdated,
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    completeSyncLog(logId, { tracksAdded: totalAdded, tracksUpdated: totalUpdated }, message)
    emit({ type: 'error', message })
  }
}

export async function runFullSync(
  emit: (event: SyncEvent) => void
): Promise<void> {
  const startedAt = Date.now()
  const logId = startSyncLog('full')
  let totalAdded = 0
  let totalUpdated = 0

  try {
    emit({ type: 'progress', phase: 'playlists', message: 'Fetching playlists…' })

    const { playlists } = await fetchWithRetry(() => getUserPlaylists())

    emit({
      type: 'progress',
      phase: 'playlists',
      message: `Found ${playlists.length} playlists`,
      total: playlists.length,
    })

    for (let i = 0; i < playlists.length; i++) {
      const pl = playlists[i]
      upsertPlaylist({
        id: pl.id,
        title: pl.title,
        track_count: pl.track_count,
        last_updated: pl.last_updated,
      })

      emit({
        type: 'progress',
        phase: 'tracks',
        message: `Syncing "${pl.title}" (${pl.track_count} tracks)`,
        current: i + 1,
        total: playlists.length,
      })

      const { added, updated } = await syncPlaylistTracks(
        pl.id,
        pl.track_count,
        (current, total) => {
          emit({
            type: 'progress',
            phase: 'tracks',
            message: `"${pl.title}": ${current}/${total} tracks`,
            current,
            total,
          })
        }
      )

      totalAdded += added
      totalUpdated += updated
      await sleep(200)
    }

    const favStats = await syncFavorites(emit)
    totalAdded += favStats.added
    totalUpdated += favStats.updated

    const mixStats = await syncMixes(emit)
    totalAdded += mixStats.added
    totalUpdated += mixStats.updated

    const historyStats = await syncHistory(emit)
    totalAdded += historyStats.added
    totalUpdated += historyStats.updated

    completeSyncLog(logId, { tracksAdded: totalAdded, tracksUpdated: totalUpdated })

    // Enrich any tracks still missing BPM via local audio analysis
    await runBpmEnrichment(emit)

    emit({
      type: 'done',
      tracksAdded: totalAdded,
      tracksUpdated: totalUpdated,
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    completeSyncLog(logId, { tracksAdded: totalAdded, tracksUpdated: totalUpdated }, message)
    emit({ type: 'error', message })
  }
}

export async function runIncrementalSync(
  emit: (event: SyncEvent) => void
): Promise<void> {
  const startedAt = Date.now()
  const logId = startSyncLog('incremental')
  let totalAdded = 0
  let totalUpdated = 0

  try {
    emit({ type: 'progress', phase: 'check', message: 'Checking for updates…' })

    const [{ playlists }, existingState] = await Promise.all([
      fetchWithRetry(() => getUserPlaylists()),
      Promise.resolve(getPlaylistSyncState()),
    ])

    const stale = playlists.filter((pl) => {
      const knownUpdated = existingState.get(pl.id)
      if (!knownUpdated) return true
      if (!pl.last_updated) return false
      return pl.last_updated > knownUpdated
    })

    emit({
      type: 'progress',
      phase: 'check',
      message: `${stale.length} playlist(s) need updating`,
      current: 0,
      total: stale.length,
    })

    for (let i = 0; i < stale.length; i++) {
      const pl = stale[i]
      upsertPlaylist({
        id: pl.id,
        title: pl.title,
        track_count: pl.track_count,
        last_updated: pl.last_updated,
      })

      emit({
        type: 'progress',
        phase: 'tracks',
        message: `Updating "${pl.title}"`,
        current: i + 1,
        total: stale.length,
      })

      const { added, updated } = await syncPlaylistTracks(
        pl.id,
        pl.track_count,
        (current, total) => {
          emit({
            type: 'progress',
            phase: 'tracks',
            message: `"${pl.title}": ${current}/${total}`,
            current,
            total,
          })
        }
      )

      totalAdded += added
      totalUpdated += updated
      await sleep(200)
    }

    // Always re-sync favorites and mixes (no reliable change timestamp)
    const favStats = await syncFavorites(emit)
    totalAdded += favStats.added
    totalUpdated += favStats.updated

    const mixStats = await syncMixes(emit)
    totalAdded += mixStats.added
    totalUpdated += mixStats.updated

    const historyStats = await syncHistory(emit)
    totalAdded += historyStats.added
    totalUpdated += historyStats.updated

    completeSyncLog(logId, { tracksAdded: totalAdded, tracksUpdated: totalUpdated })

    // Enrich any tracks still missing BPM via local audio analysis
    await runBpmEnrichment(emit)

    emit({
      type: 'done',
      tracksAdded: totalAdded,
      tracksUpdated: totalUpdated,
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    completeSyncLog(logId, { tracksAdded: totalAdded, tracksUpdated: totalUpdated }, message)
    emit({ type: 'error', message })
  }
}
