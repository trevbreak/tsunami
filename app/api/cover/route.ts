import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

/**
 * Same-origin proxy for TIDAL cover art. The CDN (resources.tidal.com) doesn't
 * send CORS headers, so a cross-origin <canvas> readback for dominant-colour
 * extraction would taint and throw. Proxying the image through our own origin
 * makes the canvas readback succeed. Display <img>s still load the CDN directly;
 * only the colour-extraction path uses this.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return new Response('missing u', { status: 400 })

  // SSRF guard: only proxy TIDAL's image CDN.
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return new Response('bad url', { status: 400 })
  }
  if (parsed.hostname !== 'resources.tidal.com') {
    return new Response('forbidden host', { status: 403 })
  }

  const upstream = await fetch(parsed.toString())
  if (!upstream.ok) return new Response('upstream error', { status: 502 })

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}
