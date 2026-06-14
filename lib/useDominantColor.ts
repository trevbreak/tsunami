'use client'

import { useEffect, useState } from 'react'

/**
 * Extract a vibrant dominant colour from an album-cover image so the UI can take
 * on the mood of the music. Downscales to a tiny canvas and picks the most
 * saturated, mid-bright pixel (falling back to the average). Returns null on
 * load/CORS-taint failure so callers can fall back to a default accent.
 *
 * The TIDAL CDN sends no CORS headers, so we load the image through our own
 * same-origin /api/cover proxy to keep the canvas un-tainted. The try/catch
 * still falls back to a default accent if anything goes wrong.
 */
export function useDominantColor(url?: string | null): string | null {
  const [color, setColor] = useState<string | null>(null)

  useEffect(() => {
    if (!url) {
      setColor(null)
      return
    }
    let cancelled = false
    const img = new Image()
    // Same-origin proxy → canvas readback is allowed.
    const src = `/api/cover?u=${encodeURIComponent(url)}`

    img.onload = () => {
      if (cancelled) return
      try {
        const n = 16
        const canvas = document.createElement('canvas')
        canvas.width = n
        canvas.height = n
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(img, 0, 0, n, n)
        const { data } = ctx.getImageData(0, 0, n, n)

        let rSum = 0, gSum = 0, bSum = 0, count = 0
        let best = { score: -1, r: 45, g: 212, b: 191 }
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
          if (a < 128) continue
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          const l = (max + min) / 2
          const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255) || 1)
          rSum += r; gSum += g; bSum += b; count++
          // Prefer saturated, mid-luminance pixels (skip near-black / near-white).
          if (l > 35 && l < 225) {
            const score = sat * (1 - Math.abs(l - 140) / 140)
            if (score > best.score) best = { score, r, g, b }
          }
        }
        if (cancelled || count === 0) return
        const pick = best.score > 0.08
          ? best
          : { r: rSum / count, g: gSum / count, b: bSum / count }
        setColor(`rgb(${Math.round(pick.r)}, ${Math.round(pick.g)}, ${Math.round(pick.b)})`)
      } catch {
        if (!cancelled) setColor(null)
      }
    }
    img.onerror = () => { if (!cancelled) setColor(null) }
    img.src = src

    return () => { cancelled = true }
  }, [url])

  return color
}
