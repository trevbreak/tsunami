'use client'

import { useState } from 'react'
import type { PlaylistTrack } from '@/types'

interface Props {
  track: PlaylistTrack
  index: number
  onAccept: () => void
  onReject: () => void
}

export default function TrackCard({ track, index, onAccept, onReject }: Props) {
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
        className={`flex items-center gap-3 rounded-xl p-3 transition-all duration-200 group ${
          isAccepted
            ? 'bg-emerald-950/40 border border-emerald-700/30'
            : 'bg-zinc-900/80 border border-zinc-800/60 hover:border-zinc-700/80'
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
            <div className="h-12 w-12 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-600 text-xs font-bold select-none">
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
          <p className="truncate text-xs text-zinc-400 mt-0.5">
            {track.artist}
            {track.album && <span className="text-zinc-600"> · {track.album}</span>}
          </p>
          {track.reason && (
            <p className="truncate text-[11px] text-zinc-500 mt-1 italic">{track.reason}</p>
          )}
        </div>

        {/* Duration */}
        {track.duration ? (
          <span className="shrink-0 text-xs text-zinc-600 tabular-nums">
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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-700 hover:text-teal-400 transition-all"
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
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-500 hover:bg-emerald-800/40 hover:text-emerald-400'
            }`}
          >
            ✓
          </button>

          {/* Reject */}
          <button
            onClick={onReject}
            title="Skip this track"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-red-900/30 hover:text-red-400 transition-all text-sm"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
