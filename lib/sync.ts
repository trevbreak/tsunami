import {
  upsertTrack,
  upsertPlaylist,
  clearPlaylistTracks,
  addPlaylistTracks,
  setFavorites,
  startSyncLog,
  completeSyncLog,
  getPlaylistSyncState,
} from './db'
import {
  getUserPlaylists,
  getFavoriteTracksPage,
  getPlaylistTracksPage,
  getMixes,
  getMixTracks,
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
  })
}

async function syncPlaylistTracks(
  playlistId: string,
  totalTracks: number,
  onProgress: (current: number, total: number) => void
): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0
  let offset = 0
  const pageSize = 100
  const trackRefs: Array<{ id: string; position: number }> = []

  clearPlaylistTracks(playlistId)

  while (true) {
    const page = await fetchWithRetry(() =>
      getPlaylistTracksPage(playlistId, pageSize, offset)
    )

    for (const raw of page.tracks) {
      const result = processTrack(raw)
      if (result === 'inserted') added++
      else updated++
      trackRefs.push({ id: raw.id, position: offset + trackRefs.length })
    }

    onProgress(offset + page.count, totalTracks || page.count)

    if (page.count < pageSize) break
    offset += pageSize
    await sleep(150)
  }

  addPlaylistTracks(playlistId, trackRefs)
  return { added, updated }
}

async function syncFavorites(
  emit: (event: SyncEvent) => void
): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0
  let offset = 0
  const pageSize = 50
  const favoriteIds: string[] = []

  emit({ type: 'progress', phase: 'favorites', message: 'Syncing favourite tracks…' })

  while (true) {
    const page = await fetchWithRetry(() => getFavoriteTracksPage(pageSize, offset))

    for (const raw of page.tracks) {
      const result = processTrack(raw)
      if (result === 'inserted') added++
      else updated++
      favoriteIds.push(raw.id)
    }

    emit({
      type: 'progress',
      phase: 'favorites',
      message: `Syncing favourites… ${favoriteIds.length} tracks`,
      current: favoriteIds.length,
    })

    if (page.count < pageSize) break
    offset += pageSize
    await sleep(150)
  }

  setFavorites(favoriteIds)
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
