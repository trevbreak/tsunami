import { NextRequest } from 'next/server'
import { getPlaylistTracks } from '@/lib/tidal'

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const data = await getPlaylistTracks(id, 100)
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
