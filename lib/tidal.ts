const TIDAL_API = process.env.TIDAL_API_URL ?? 'http://127.0.0.1:5100'

async function tidalFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${TIDAL_API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `TIDAL API ${res.status}`)
  }
  return res.json()
}

export async function checkAuth(): Promise<{ authenticated: boolean; user?: { id: string; username: string } }> {
  return tidalFetch('/api/auth/status')
}

export async function triggerLogin(): Promise<{ status: string; message: string }> {
  return tidalFetch('/api/auth/login')
}

export async function getFavoriteTracks(limit = 50): Promise<{ tracks: RawTrack[] }> {
  return tidalFetch(`/api/tracks?limit=${limit}`)
}

export async function getFavoriteTracksPage(
  limit: number,
  offset: number
): Promise<{ tracks: RawTrack[]; count: number }> {
  return tidalFetch(`/api/tracks?limit=${limit}&offset=${offset}`)
}

export async function getBatchRecommendations(
  trackIds: string[],
  limitPerTrack = 10
): Promise<{ recommendations: RawTrack[] }> {
  return tidalFetch('/api/recommendations/batch', {
    method: 'POST',
    body: JSON.stringify({ track_ids: trackIds, limit_per_track: limitPerTrack, remove_duplicates: true }),
  })
}

export async function getUserPlaylists(): Promise<{
  playlists: Array<{ id: string; title: string; track_count: number; last_updated: string | null }>
}> {
  return tidalFetch('/api/playlists')
}

export async function getPlaylistTracks(
  playlistId: string,
  limit = 100
): Promise<{ tracks: RawTrack[] }> {
  return tidalFetch(`/api/playlists/${playlistId}/tracks?limit=${limit}`)
}

export async function getPlaylistTracksPage(
  playlistId: string,
  limit: number,
  offset: number
): Promise<{ tracks: RawTrack[]; count: number; total_tracks: number }> {
  return tidalFetch(`/api/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`)
}

export async function getMixes(): Promise<{
  mixes: Array<{ id: string; title: string; sub_title: string; track_count: number }>
  warning?: string
}> {
  return tidalFetch('/api/mixes')
}

export async function getMixTracks(
  mixId: string,
  limit = 100
): Promise<{ tracks: RawTrack[] }> {
  return tidalFetch(`/api/mixes/${mixId}/tracks?limit=${limit}`)
}

export async function addTracksToPlaylist(
  playlistId: string,
  trackIds: string[]
): Promise<{ status: string; added_count: number }> {
  return tidalFetch(`/api/playlists/${playlistId}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ track_ids: trackIds }),
  })
}

export async function createPlaylist(
  title: string,
  description: string,
  trackIds: string[]
): Promise<{ status: string; playlist: { id: string; title: string } }> {
  return tidalFetch('/api/playlists', {
    method: 'POST',
    body: JSON.stringify({ title, description, track_ids: trackIds }),
  })
}

export async function* enrichBpmBatch(
  trackIds: string[]
): AsyncGenerator<
  | { done: false; trackId: string; bpm: number | null; analyzed: number; total: number }
  | { done: true; analyzed: number; failed: number; total: number }
> {
  const res = await fetch(`${TIDAL_API}/api/bpm/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_ids: trackIds }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`BPM batch failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = JSON.parse(line.slice(6))
      if (data.done) {
        yield { done: true, analyzed: data.analyzed, failed: data.failed, total: data.total }
      } else {
        yield { done: false, trackId: data.track_id, bpm: data.bpm ?? null, analyzed: data.analyzed, total: data.total }
      }
    }
  }
}

export interface RawTrack {
  id: string
  title: string
  artist: string
  album?: string
  duration?: number
  bpm?: number
  cover_url?: string
  url?: string
  isrc?: string
  popularity?: number
  explicit?: boolean
  release_date?: string
  audio_quality?: string
}
