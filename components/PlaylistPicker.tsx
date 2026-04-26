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
        <div className="h-6 w-6 rounded-full border-2 border-zinc-700 border-t-teal-400 animate-spin" />
        <p className="text-sm text-zinc-500">Loading your playlists…</p>
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
        <h2 className="text-base font-semibold text-white">Choose a playlist to enhance</h2>
        <p className="text-xs text-zinc-500">
          Select a playlist and Tsunami will find new tracks that match its style
        </p>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search playlists…"
        className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-teal-500 focus:outline-none"
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
              className="flex items-center gap-4 rounded-xl border border-zinc-800/60 bg-zinc-900/60 p-4 text-left transition-all hover:border-teal-700/40 hover:bg-zinc-800/60 group"
            >
              {/* Playlist icon */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xl group-hover:bg-zinc-700 transition-colors">
                🎵
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white text-sm">{p.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {p.track_count} tracks
                  {p.description && (
                    <span className="text-zinc-600"> · {p.description.slice(0, 60)}</span>
                  )}
                </p>
              </div>

              <div className="shrink-0 text-zinc-600 group-hover:text-teal-400 transition-colors text-lg">
                →
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
