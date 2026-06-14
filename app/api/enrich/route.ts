import { dbExists, getFeaturesCount } from '@/lib/db'
import { runEnrichment } from '@/lib/enrich'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Run LLM enrichment over un-enriched library tracks, streaming progress (SSE).
 * GET returns current coverage; POST runs the batch enrichment.
 */
export async function GET() {
  if (!dbExists()) return Response.json({ enriched: 0, total: 0 })
  return Response.json(getFeaturesCount())
}

export async function POST() {
  if (!dbExists()) {
    return Response.json({ error: 'No library synced yet.' }, { status: 409 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (e: object) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`))
      try {
        for await (const event of runEnrichment()) send(event)
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
