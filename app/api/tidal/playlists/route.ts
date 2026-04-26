import { getUserPlaylists } from '@/lib/tidal'

export async function GET() {
  try {
    const data = await getUserPlaylists()
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
