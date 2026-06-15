'use client'

import { useState } from 'react'
import type { Track } from '@/types'

interface Props {
  alternatives: Track[]
  loading: boolean
  onSwap: (alt: Track) => void
  onRemove: () => void
  onCancel: () => void
}

function AltRow({ alt, onSwap }: { alt: Track; onSwap: (a: Track) => void }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2 transition-colors hover:bg-white/10">
      {alt.cover_url && !imgError ? (
        <img
          src={alt.cover_url}
          alt=""
          className="h-9 w-9 rounded-md object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-xs font-bold text-white/50 select-none">
          {alt.artist?.[0] ?? '♪'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight text-white">{alt.title}</p>
        <p className="truncate text-xs text-white/65">
          {alt.artist}
          {alt.reason && <span className="text-white/40"> · {alt.reason}</span>}
        </p>
      </div>
      <button
        onClick={() => onSwap(alt)}
        className="shrink-0 rounded-md px-2.5 py-1 text-xs font-bold text-[#10031f] transition-transform hover:scale-[1.04]"
        style={{ background: 'linear-gradient(135deg,#7dd3fc,#a5f3fc)' }}
      >
        Swap in
      </button>
    </div>
  )
}

export default function SwapAlternatives({ alternatives, loading, onSwap, onRemove, onCancel }: Props) {
  return (
    <div
      className="glass mt-1 mb-2 flex flex-col gap-2 rounded-xl p-3"
      style={{ animation: 'fadeUp 0.25s ease both' }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
          {loading ? 'Finding alternatives…' : alternatives.length ? 'Swap in a better fit' : 'No close matches'}
        </p>
        <button
          onClick={onCancel}
          className="text-xs text-white/50 transition-colors hover:text-white"
        >
          Cancel
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-white/60">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-fuchsia-300" />
          Looking for tracks that fit this slot…
        </div>
      ) : alternatives.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {alternatives.map((alt) => (
            <AltRow key={alt.tidal_id} alt={alt} onSwap={onSwap} />
          ))}
        </div>
      ) : (
        <p className="py-1 text-xs text-white/55">
          Couldn&apos;t find a close match for this spot. You can still remove it.
        </p>
      )}

      <button
        onClick={onRemove}
        className="mt-1 self-start rounded-lg px-2 py-1 text-xs text-white/55 transition-colors hover:bg-red-500/15 hover:text-red-300"
      >
        Remove entirely
      </button>
    </div>
  )
}
