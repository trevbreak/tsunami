'use client'

import { useState, useEffect } from 'react'
import TrackCard from './TrackCard'
import SwapAlternatives from './SwapAlternatives'
import { MOOD_TITLES, monthYear } from '@/lib/playlistName'
import { useDominantColor } from '@/lib/useDominantColor'
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

  // Cinematic hero: the playlist takes on the colour of its cover art.
  const heroCover = visible.find((t) => t.cover_url)?.cover_url
  const accent = useDominantColor(heroCover) ?? '#2dd4bf'
  const [heroImgError, setHeroImgError] = useState(false)

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
      {/* Cinematic hero — colour washes in from the cover art */}
      <div className="glass relative overflow-hidden rounded-2xl">
        {/* accent wash + translucent veil (glassy, lets vibrant bg through) */}
        <div
          className="absolute inset-0 transition-[background] duration-700"
          style={{ background: `radial-gradient(120% 150% at 0% 0%, ${accent}, transparent 55%), radial-gradient(120% 130% at 100% 10%, ${accent}, transparent 65%)` }}
        />
        <div className="absolute inset-0 bg-black/45 backdrop-blur-2xl" />

        <div className="relative flex items-end gap-4 p-4 sm:gap-5 sm:p-5">
          {/* Cover */}
          <div
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl sm:h-32 sm:w-32"
            style={{ boxShadow: `0 18px 50px -16px ${accent}` }}
          >
            {heroCover && !heroImgError ? (
              <img src={heroCover} alt="" className="h-full w-full object-cover" onError={() => setHeroImgError(true)} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900 text-3xl">🌊</div>
            )}
          </div>

          {/* Meta */}
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>
              {saveLabel ? 'Enhancing' : 'Playlist'}
            </span>
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => { setTitle(e.target.value); setUserEdited(true) }}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false) }}
                placeholder="Name your playlist…"
                className="mt-1 block w-full max-w-md rounded-md border border-white/20 bg-black/30 px-2 py-1 text-2xl font-extrabold tracking-tight text-white placeholder-zinc-500 focus:border-white/50 focus:outline-none sm:text-3xl"
              />
            ) : (
              <button
                onClick={() => setEditingTitle(true)}
                className="group/title mt-0.5 flex items-center gap-2 rounded-md -mx-1 px-1 py-0.5 text-left text-2xl font-extrabold tracking-tight text-white transition-colors hover:bg-white/5 sm:text-3xl"
                title="Click to rename before saving"
              >
                <span className="truncate">{title}</span>
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-white/40 transition-colors group-hover/title:text-white" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M11.5 1.5l3 3L5 14l-3.5.5L2 11l9.5-9.5zM10 3l3 3" />
                </svg>
              </button>
            )}
            <p className="mt-1.5 text-xs text-zinc-300/90">
              <span className="font-semibold text-white">{accepted.length}</span> confirmed · {pending.length} pending
              {durationDisplay && <span> · <span className="font-semibold text-white">{durationDisplay}</span></span>}
            </p>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {savedUrl ? (
                <a
                  href={savedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-emerald-950 transition-transform hover:scale-[1.03]"
                >
                  <span>✓</span> Open in TIDAL
                </a>
              ) : (
                <button
                  onClick={() => onSave(title)}
                  disabled={isSaving || !hasAccepted}
                  className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-black transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  style={{ background: hasAccepted ? accent : '#3f3f46', color: hasAccepted ? '#08110f' : '#a1a1aa' }}
                >
                  {isSaving ? (
                    <>
                      <span className="h-3 w-3 rounded-full border-2 border-black/30 border-t-black animate-spin" />
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
              {pending.length > 0 && (
                <button
                  onClick={acceptAll}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
                >
                  Accept all
                </button>
              )}
            </div>
          </div>
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
