import { NextRequest, NextResponse } from 'next/server'
import { createPlaylist } from '@/lib/tidal'

export async function POST(req: NextRequest) {
  const { title, description, trackIds } = await req.json() as {
    title: string
    description: string
    trackIds: string[]
  }

  if (!title || !trackIds?.length) {
    return NextResponse.json({ error: 'title and trackIds are required' }, { status: 400 })
  }

  try {
    const result = await createPlaylist(title, description ?? '', trackIds)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
