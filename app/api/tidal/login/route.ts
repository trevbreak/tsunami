import { NextResponse } from 'next/server'
import { triggerLogin } from '@/lib/tidal'

export async function POST() {
  try {
    const result = await triggerLogin()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ status: 'error', message: String(err) }, { status: 500 })
  }
}
