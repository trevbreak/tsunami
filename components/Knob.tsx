'use client'

import { useId, useRef } from 'react'

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
  size?: number
}

const SWEEP = 270 // degrees of travel

/**
 * Vibrant rotary knob. Drag up/down (or arrow keys) to change the value; a
 * gradient arc shows the level and the cap's indicator points to it.
 */
export default function Knob({
  value, min, max, step = 1, onChange, label, display, from, to, size = 88,
}: Props) {
  const gid = useId().replace(/[:]/g, '')
  const drag = useRef<{ y: number; v: number } | null>(null)

  const frac = Math.max(0, Math.min(1, (value - min) / (max - min || 1)))
  const r = 38
  const c = 2 * Math.PI * r
  const arc = frac * (SWEEP / 360) * c
  const angle = -135 + frac * SWEEP

  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step))

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    drag.current = { y: e.clientY, v: value }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dy = drag.current.y - e.clientY // up = increase
    const next = clamp(drag.current.v + (dy / 170) * (max - min))
    if (next !== value) onChange(next)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onChange(clamp(value + step)) }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(clamp(value - step)) }
  }

  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-2 py-3.5">
      <div
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null }}
        onKeyDown={onKeyDown}
        className="relative cursor-ns-resize touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox="0 0 92 92">
          <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
          <circle
            cx="46" cy="46" r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${arc} ${c}`} transform="rotate(135 46 46)"
            style={{ transition: 'stroke-dasharray 0.05s linear' }}
          />
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={from} />
              <stop offset="1" stopColor={to} />
            </linearGradient>
          </defs>
        </svg>
        <div
          className="absolute rounded-full border border-white/20"
          style={{
            inset: size * 0.22,
            background: 'radial-gradient(circle at 38% 30%, rgba(255,255,255,0.28), rgba(10,8,20,0.92) 70%)',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)',
            transform: `rotate(${angle}deg)`,
          }}
        >
          <span
            className="absolute left-1/2 top-1.5 h-3.5 w-[3px] -translate-x-1/2 rounded bg-white"
            style={{ boxShadow: '0 0 8px rgba(255,255,255,0.85)' }}
          />
        </div>
      </div>
      <div className="text-lg font-extrabold leading-none tracking-tight">{display}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-white/55">{label}</div>
    </div>
  )
}
