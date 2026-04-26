import { NextRequest } from 'next/server'
import { addTracksToPlaylist } from '@/lib/tidal'

export async function POST(req: NextRequest) {
  try {
    const { playlistId, trackIds } = await req.json() as {
      playlistId: string
      trackIds: string[]
    }
    if (!playlistId || !Array.isArray(trackIds)) {
      return Response.json({ error: 'Missing playlistId or trackIds' }, { status: 400 })
    }
    const data = await addTracksToPlaylist(playlistId, trackIds)
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
