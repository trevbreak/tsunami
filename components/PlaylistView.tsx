'use client'

import { useState, useEffect } from 'react'
import TrackCard from './TrackCard'
import SwapAlternatives from './SwapAlternatives'
import { MOOD_TITLES, monthYear } from '@/lib/playlistName'
import type { PlaylistTrack, Mood, Track } from '@/types'

interface Props {
  tracks: PlaylistTrack[]
  mood: Mood | null
  defaultTitle?: string
  onUpdateStatus: (tidalId: string, status: 'accepted' | 'rejected') => void
  onRequestSwap: (tidalId: string) => void
  swapForId: string | null
  alternatives: Track[]
  loadingAlternatives: boolean
  onSwap: (oldId: string, alt: Track) => void
  onRemoveEntirely: (tidalId: string) => void
  onCancelSwap: () => void
  onSave: (title: string) => void
  saveLabel?: string
  isSaving: boolean
  savedUrl: string
}

export default function PlaylistView({
  tracks,
  mood,
  defaultTitle: externalDefaultTitle,
  onUpdateStatus,
  onRequestSwap,
  swapForId,
  alternatives,
  loadingAlternatives,
  onSwap,
  onRemoveEntirely,
  onCancelSwap,
  onSave,
  saveLabel,
  isSaving,
  savedUrl,
}: Props) {
  const month = monthYear()
  const computedDefault = externalDefaultTitle ?? (mood ? `${MOOD_TITLES[mood]} · ${month}` : `Tsunami Mix · ${month}`)
  const [title, setTitle] = useState(computedDefault)
  const [editingTitle, setEditingTitle] = useState(false)
  // Keep the default in sync as mood/run config change — but never clobber a
  // name the user has typed themselves.
  const [userEdited, setUserEdited] = useState(false)

  useEffect(() => {
    if (!userEdited) setTitle(computedDefault)
  }, [computedDefault, userEdited])

  const visible = tracks.filter((t) => t.status !== 'rejected')
  const accepted = tracks.filter((t) => t.status === 'accepted')
  const pending = tracks.filter((t) => t.status === 'pending')
  const hasAccepted = accepted.length > 0

  const totalDurationSec = tracks
    .filter((t) => t.status !== 'rejected' && t.duration)
    .reduce((sum, t) => sum + (t.duration ?? 0), 0)
  const durationDisplay = totalDurationSec > 0
    ? totalDurationSec >= 3600
      ? `${Math.floor(totalDurationSec / 3600)}h ${Math.floor((totalDurationSec % 3600) / 60)}m`
      : `${Math.floor(totalDurationSec / 60)}m`
    : null

  function acceptAll() {
    pending.forEach((t) => onUpdateStatus(t.tidal_id, 'accepted'))
  }

  return (
    <div className="flex flex-col gap-4" style={{ animation: 'springIn 0.35s ease both' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-600">
              Playlist name
            </label>
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => { setTitle(e.target.value); setUserEdited(true) }}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false) }}
                placeholder="Name your playlist…"
                className="mt-0.5 w-72 max-w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-base font-semibold text-white placeholder-zinc-600 focus:border-teal-400 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => setEditingTitle(true)}
                className="group/title mt-0.5 flex items-center gap-1.5 rounded-md px-1 -mx-1 py-0.5 text-left text-base font-semibold text-white transition-colors hover:bg-zinc-800/60"
                title="Click to rename before saving"
              >
                <span className="truncate">{title}</span>
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-zinc-600 transition-colors group-hover/title:text-teal-400">
                  <path d="M11.5 1.5l3 3L5 14l-3.5.5L2 11l9.5-9.5zM10 3l3 3" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </svg>
              </button>
            )}
            <p className="mt-1 text-xs text-zinc-500">
              {accepted.length} confirmed · {pending.length} pending
              {durationDisplay && <span> · {durationDisplay}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <button
              onClick={acceptAll}
              className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              Accept all
            </button>
          )}
          {savedUrl ? (
            <a
              href={savedUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 transition-colors"
            >
              <span>✓</span> Open in TIDAL
            </a>
          ) : (
            <button
              onClick={() => onSave(title)}
              disabled={isSaving || !hasAccepted}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-40 transition-colors"
            >
              {isSaving ? (
                <>
                  <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M2 14h12V6H2v8zM6 2v3h4V2H6z" />
                  </svg>
                  {saveLabel ?? 'Save to TIDAL'}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Track list - includes all tracks, rejected ones collapse via TrackCard animation */}
      <div>
        {tracks.map((track, i) => (
          <div key={track.tidal_id}>
            <TrackCard
              track={track}
              index={i}
              isSwapping={swapForId === track.tidal_id}
              onAccept={() => onUpdateStatus(track.tidal_id, 'accepted')}
              onReject={() => onRequestSwap(track.tidal_id)}
            />
            {swapForId === track.tidal_id && (
              <SwapAlternatives
                alternatives={alternatives}
                loading={loadingAlternatives}
                onSwap={(alt) => onSwap(track.tidal_id, alt)}
                onRemove={() => onRemoveEntirely(track.tidal_id)}
                onCancel={onCancelSwap}
              />
            )}
          </div>
        ))}
      </div>

      {!hasAccepted && visible.length > 0 && (
        <p className="text-center text-xs text-zinc-600">
          ✓ to add tracks · ✕ to skip and find alternatives
        </p>
      )}
    </div>
  )
}
