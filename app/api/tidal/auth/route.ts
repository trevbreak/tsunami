import { NextResponse } from 'next/server'
import { checkAuth } from '@/lib/tidal'

export async function GET() {
  try {
    const status = await checkAuth()
    return NextResponse.json(status)
  } catch {
    return NextResponse.json({ authenticated: false, message: 'TIDAL service unreachable' })
  }
}
