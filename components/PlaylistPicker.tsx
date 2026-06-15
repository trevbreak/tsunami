'use client'

import { useEffect, useState } from 'react'
import type { ExistingPlaylist } from '@/types'

interface Props {
  onSelect: (playlist: ExistingPlaylist) => void
}

export default function PlaylistPicker({ onSelect }: Props) {
  const [playlists, setPlaylists] = useState<ExistingPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/tidal/playlists')
        const data = await res.json()
        setPlaylists(data.playlists ?? [])
      } catch {
        setError('Failed to load playlists')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = playlists.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-fuchsia-300 animate-spin" />
        <p className="text-sm text-white/60">Loading your playlists…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold gradient-text">Choose a playlist to enhance</h2>
        <p className="text-xs text-white/55">
          Select a playlist and Tsunami will find new tracks that match its style
        </p>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search playlists…"
        className="w-full rounded-xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/40 backdrop-blur focus:border-fuchsia-400/60 focus:outline-none"
      />

      {/* List */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-600">No playlists found</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur transition-all hover:border-white/20 hover:bg-white/10"
            >
              {/* Playlist icon */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xl transition-colors group-hover:bg-white/15">
                🎵
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{p.title}</p>
                <p className="mt-0.5 text-xs text-white/55">
                  {p.track_count} tracks
                  {p.description && (
                    <span className="text-white/40"> · {p.description.slice(0, 60)}</span>
                  )}
                </p>
              </div>

              <div className="shrink-0 text-lg text-white/40 transition-colors group-hover:text-fuchsia-300">
                →
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
