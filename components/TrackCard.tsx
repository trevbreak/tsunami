'use client'

import { useState } from 'react'
import type { PlaylistTrack } from '@/types'

interface Props {
  track: PlaylistTrack
  index: number
  isSwapping?: boolean
  onAccept: () => void
  onReject: () => void
}

export default function TrackCard({ track, index, isSwapping = false, onAccept, onReject }: Props) {
  const [imgError, setImgError] = useState(false)
  const isAccepted = track.status === 'accepted'
  const isRejected = track.status === 'rejected'

  const tidalUrl = track.tidal_url ?? `https://tidal.com/browse/track/${track.tidal_id}`

  return (
    // Outer wrapper collapses smoothly when rejected
    <div
      style={{
        maxHeight: isRejected ? 0 : 120,
        opacity: isRejected ? 0 : 1,
        overflow: 'hidden',
        transition: 'max-height 0.35s ease, opacity 0.25s ease, margin 0.35s ease',
        marginBottom: isRejected ? 0 : 8,
      }}
    >
      <div
        className={`flex items-center gap-3 rounded-xl p-3 transition-all duration-200 group backdrop-blur ${
          isSwapping
            ? 'bg-white/8 border border-sky-400/50 ring-1 ring-sky-400/25'
            : isAccepted
            ? 'border border-emerald-400/40 bg-emerald-400/10'
            : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
        }`}
        style={{
          animation: `fadeUp 0.3s ease ${index * 0.04}s both`,
        }}
      >
        {/* Album art */}
        <div className="relative shrink-0">
          {track.cover_url && !imgError ? (
            <img
              src={track.cover_url}
              alt=""
              className="h-12 w-12 rounded-lg object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-white/10 flex items-center justify-center text-white/50 text-xs font-bold select-none">
              {track.artist?.[0] ?? '♪'}
            </div>
          )}
          {isAccepted && (
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center">
              <span className="text-[9px] text-white font-bold">✓</span>
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white leading-tight">{track.title}</p>
          <p className="truncate text-xs text-white/65 mt-0.5">
            {track.artist}
            {track.album && <span className="text-white/40"> · {track.album}</span>}
          </p>
          {track.reason && (
            <p className="truncate text-[11px] text-white/55 mt-1 italic">{track.reason}</p>
          )}
        </div>

        {/* Duration */}
        {track.duration ? (
          <span className="shrink-0 text-xs text-white/45 tabular-nums">
            {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}
          </span>
        ) : null}

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Play in TIDAL */}
          <a
            href={tidalUrl}
            target="_blank"
            rel="noreferrer"
            title="Play in TIDAL"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/15 hover:text-sky-300 transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
            </svg>
          </a>

          {/* Accept */}
          <button
            onClick={onAccept}
            title="Add to playlist"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all text-sm font-medium ${
              isAccepted
                ? 'bg-emerald-500 text-emerald-950'
                : 'text-white/50 hover:bg-emerald-400/20 hover:text-emerald-300'
            }`}
          >
            ✓
          </button>

          {/* Reject → find alternatives / remove */}
          <button
            onClick={onReject}
            title="Not feeling it? Find alternatives or remove"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all text-sm ${
              isSwapping
                ? 'bg-teal-600/20 text-teal-400'
                : 'text-zinc-600 hover:bg-red-900/30 hover:text-red-400'
            }`}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
