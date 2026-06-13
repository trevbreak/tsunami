import { NextRequest } from 'next/server'
import { runFullSync, runIncrementalSync, runQuickSync } from '@/lib/sync'
import type { SyncEvent } from '@/lib/sync'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { mode?: 'full' | 'incremental' | 'quick' }
  const mode = body.mode === 'full' || body.mode === 'quick' ? body.mode : 'incremental'

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (event: SyncEvent) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`))

      try {
        if (mode === 'full') {
          await runFullSync(send)
        } else if (mode === 'quick') {
          await runQuickSync(send)
        } else {
          await runIncrementalSync(send)
        }
      } catch (err) {
        send({ type: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
