'use client'

import { useState, useEffect } from 'react'
import TrackCard from './TrackCard'
import type { PlaylistTrack, Mood } from '@/types'

const MOOD_TITLES: Record<Mood, string> = {
  romance: 'Tender Moments',
  energetic: 'High Energy Mix',
  chill: 'Chill Vibes',
  melancholy: 'Introspective',
  focus: 'Deep Focus',
  party: 'Party Mix',
}

interface Props {
  tracks: PlaylistTrack[]
  mood: Mood | null
  onUpdateStatus: (tidalId: string, status: 'accepted' | 'rejected') => void
  onRejectAndRefresh: (tidalId: string) => void
  onSave: (title: string) => void
  saveLabel?: string
  isSaving: boolean
  savedUrl: string
}

export default function PlaylistView({
  tracks,
  mood,
  onUpdateStatus,
  onRejectAndRefresh,
  onSave,
  saveLabel,
  isSaving,
  savedUrl,
}: Props) {
  const month = new Date().toLocaleString('default', { month: 'short', year: 'numeric' })
  const defaultTitle = mood ? `${MOOD_TITLES[mood]} · ${month}` : `AI Curated Mix · ${month}`
  const [title, setTitle] = useState(defaultTitle)
  const [editingTitle, setEditingTitle] = useState(false)

  useEffect(() => {
    setTitle(mood ? `${MOOD_TITLES[mood]} · ${month}` : `AI Curated Mix · ${month}`)
  }, [mood])

  const visible = tracks.filter((t) => t.status !== 'rejected')
  const accepted = tracks.filter((t) => t.status === 'accepted')
  const pending = tracks.filter((t) => t.status === 'pending')
  const hasAccepted = accepted.length > 0

  function acceptAll() {
    pending.forEach((t) => onUpdateStatus(t.tidal_id, 'accepted'))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                className="bg-transparent text-base font-semibold text-white border-b border-zinc-600 focus:outline-none focus:border-teal-400 pb-0.5 min-w-0 w-64"
              />
            ) : (
              <button
                onClick={() => setEditingTitle(true)}
                className="text-base font-semibold text-white hover:text-zinc-300 transition-colors text-left"
                title="Click to rename"
              >
                {title}
              </button>
            )}
            <p className="text-xs text-zinc-500 mt-0.5">
              {accepted.length} confirmed · {pending.length} pending
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
          <TrackCard
            key={track.tidal_id}
            track={track}
            index={i}
            onAccept={() => onUpdateStatus(track.tidal_id, 'accepted')}
            onReject={() => onRejectAndRefresh(track.tidal_id)}
          />
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
