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
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-2 transition-colors hover:border-zinc-700">
      {alt.cover_url && !imgError ? (
        <img
          src={alt.cover_url}
          alt=""
          className="h-9 w-9 rounded-md object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-800 text-xs font-bold text-zinc-600 select-none">
          {alt.artist?.[0] ?? '♪'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight text-white">{alt.title}</p>
        <p className="truncate text-xs text-zinc-400">
          {alt.artist}
          {alt.reason && <span className="text-zinc-600"> · {alt.reason}</span>}
        </p>
      </div>
      <button
        onClick={() => onSwap(alt)}
        className="shrink-0 rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-teal-500"
      >
        Swap in
      </button>
    </div>
  )
}

export default function SwapAlternatives({ alternatives, loading, onSwap, onRemove, onCancel }: Props) {
  return (
    <div
      className="mt-1 mb-2 flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
      style={{ animation: 'fadeUp 0.25s ease both' }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {loading ? 'Finding alternatives…' : alternatives.length ? 'Swap in a better fit' : 'No close matches'}
        </p>
        <button
          onClick={onCancel}
          className="text-xs text-zinc-600 transition-colors hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-zinc-500">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-400" />
          Looking for tracks that fit this slot…
        </div>
      ) : alternatives.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {alternatives.map((alt) => (
            <AltRow key={alt.tidal_id} alt={alt} onSwap={onSwap} />
          ))}
        </div>
      ) : (
        <p className="py-1 text-xs text-zinc-500">
          Couldn&apos;t find a close match for this spot. You can still remove it.
        </p>
      )}

      <button
        onClick={onRemove}
        className="mt-1 self-start rounded-lg px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-red-900/20 hover:text-red-400"
      >
        Remove entirely
      </button>
    </div>
  )
}
