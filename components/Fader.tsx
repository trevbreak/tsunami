'use client'

import { useRef } from 'react'

interface Props {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label: string
  display: string
  from: string
  to: string
  ticks?: string[]
}

/**
 * Vibrant horizontal fader. Click/drag anywhere on the rail (or arrow keys) to
 * set the value; gradient fill + glowing thumb track the level.
 */
export default function Fader({
  value, min, max, step = 1, onChange, label, display, from, to, ticks,
}: Props) {
  const rail = useRef<HTMLDivElement>(null)
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min || 1)))
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step))

  const setFromX = (clientX: number) => {
    const el = rail.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onChange(clamp(min + f * (max - min)))
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.12em] text-white/55">{label}</span>
        <span className="text-base font-extrabold">{display}</span>
      </div>
      <div
        ref={rail}
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setFromX(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons === 1) setFromX(e.clientX) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + step)) }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - step)) }
        }}
        className="relative h-3 cursor-pointer touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        style={{ background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-lg"
          style={{ width: `${frac * 100}%`, background: `linear-gradient(90deg, ${from}, ${to})` }}
        />
        <div
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-lg"
          style={{ left: `${frac * 100}%`, background: 'linear-gradient(180deg, #fff, #dbe4ff)', boxShadow: '0 4px 12px rgba(0,0,0,0.5), 0 0 0 4px rgba(255,255,255,0.12)' }}
        />
      </div>
      {ticks && (
        <div className="mt-2 flex justify-between text-[10px] text-white/40">
          {ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      )}
    </div>
  )
}
