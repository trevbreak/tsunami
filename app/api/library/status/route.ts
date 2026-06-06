import { NextResponse } from 'next/server'
import { dbExists, getLibraryStatus } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  try {
    if (!dbExists()) {
      return NextResponse.json({
        synced: false,
        lastSync: null,
        trackCount: 0,
        favoriteCount: 0,
        playlistCount: 0,
        bpmTracksCount: 0,
      })
    }
    const status = getLibraryStatus()
    return NextResponse.json({
      synced: status.lastSync !== null,
      lastSync: status.lastSync,
      trackCount: status.trackCount,
      favoriteCount: status.favoriteCount,
      playlistCount: status.playlistCount,
      bpmTracksCount: status.bpmTracksCount,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
