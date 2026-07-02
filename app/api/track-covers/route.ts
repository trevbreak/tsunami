import { NextRequest } from 'next/server'
import { getTrackCovers } from '@/lib/tidal'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { ids } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0) return Response.json({})
  try {
    const covers = await getTrackCovers(ids)
    return Response.json(covers)
  } catch {
    return Response.json({})
  }
}
