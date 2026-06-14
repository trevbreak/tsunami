import { NextRequest } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

/**
 * Persistence for the recommender tuning harness (public/tuner.html).
 * Stores each round's test results + structured feedback as JSON on disk so the
 * tuning loop survives reloads and can be read back to inform the next iteration.
 */
const DIR = path.join(process.cwd(), 'nimbalyst-local', 'tuning')

function fileFor(round: number | string): string {
  const safe = String(round).replace(/[^a-z0-9_-]/gi, '')
  return path.join(DIR, `round-${safe || '1'}.json`)
}

export async function GET(req: NextRequest) {
  const round = req.nextUrl.searchParams.get('round') ?? '1'
  try {
    const raw = await fs.readFile(fileFor(round), 'utf8')
    return Response.json(JSON.parse(raw))
  } catch {
    return Response.json({ round, tests: {} }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const round = body?.round ?? '1'
  await fs.mkdir(DIR, { recursive: true })
  const payload = { ...body, updatedAt: new Date().toISOString() }
  await fs.writeFile(fileFor(round), JSON.stringify(payload, null, 2), 'utf8')
  return Response.json({ ok: true, path: `nimbalyst-local/tuning/round-${round}.json` })
}
