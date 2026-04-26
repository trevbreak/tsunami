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

export interface RawTrack {
  id: string
  title: string
  artist: string
  album?: string
  duration?: number
  cover_url?: string
  url?: string
}
