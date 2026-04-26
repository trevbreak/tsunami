'use client'

import { useEffect, useRef, useState } from 'react'
import ConnectTidal from '@/components/ConnectTidal'
import PlaylistView from '@/components/PlaylistView'
import FeedbackBar from '@/components/FeedbackBar'
import MoodSelector from '@/components/MoodSelector'
import GeneratingView from '@/components/GeneratingView'
import PlaylistPicker from '@/components/PlaylistPicker'
import type { ExistingPlaylist, Message, Mood, PlaylistTrack, StreamEvent, Track } from '@/types'

type AppStatus = 'checking' | 'disconnected' | 'connected'
type AppMode = 'create' | 'enhance'

const MOOD_COLORS: Record<Mood, string> = {
  romance: '#f472b6',
  energetic: '#fb923c',
  chill: '#34d399',
  melancholy: '#a78bfa',
  focus: '#38bdf8',
  party: '#fbbf24',
}

export default function Home() {
  const [appStatus, setAppStatus] = useState<AppStatus>('checking')
  const [tidalUser, setTidalUser] = useState<string>('')

  // Mode
  const [mode, setMode] = useState<AppMode>('create')

  // Create mode
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null)
  const [createMessages, setCreateMessages] = useState<Message[]>([])

  // Enhance mode
  const [targetPlaylist, setTargetPlaylist] = useState<ExistingPlaylist | null>(null)
  const [playlistTracks, setPlaylistTracks] = useState<Array<{ id: string; title: string; artist: string; cover_url?: string; url?: string }>>([])
  const [loadingPlaylistTracks, setLoadingPlaylistTracks] = useState(false)
  const [enhanceMessages, setEnhanceMessages] = useState<Message[]>([])

  // Shared generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusPhase, setStatusPhase] = useState<string>('favorites')
  const [error, setError] = useState('')
  const [tracks, setTracks] = useState<PlaylistTrack[]>([])

  // Save state
  const [isSaving, setIsSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState('')

  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isGeneratingRef = useRef(false)

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { isGeneratingRef.current = isGenerating }, [isGenerating])

  // When mode changes, reset tracks and saved state
  useEffect(() => {
    setTracks([])
    setSavedUrl('')
    setError('')
    setTargetPlaylist(null)
    setPlaylistTracks([])
  }, [mode])

  async function checkAuth() {
    setAppStatus('checking')
    try {
      const res = await fetch('/api/tidal/auth')
      const data = await res.json()
      if (data.authenticated) {
        setTidalUser(data.user?.username ?? data.user?.id ?? '')
        setAppStatus('connected')
      } else {
        setAppStatus('disconnected')
      }
    } catch {
      setAppStatus('disconnected')
    }
  }

  function mergeIncomingTracks(incoming: Track[]) {
    setTracks((prev) => {
      const prevMap = new Map(prev.map((t) => [t.tidal_id, t]))
      return incoming.map((t) => ({
        ...t,
        status: prevMap.get(t.tidal_id)?.status ?? 'pending',
      }))
    })
  }

  function updateTrackStatus(tidalId: string, status: 'accepted' | 'rejected') {
    setTracks((prev) => prev.map((t) => (t.tidal_id === tidalId ? { ...t, status } : t)))
  }

  function handleRejectAndRefresh(tidalId: string) {
    updateTrackStatus(tidalId, 'rejected')
    if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current)
    rejectTimerRef.current = setTimeout(() => {
      if (!isGeneratingRef.current) {
        if (mode === 'create') {
          runGenerate('Swap in a fresh discovery to replace the track I just skipped.')
        } else {
          runEnhance('Swap in a fresh discovery to replace the track I just skipped.')
        }
      }
    }, 500)
  }

  // ---------- CREATE mode ----------

  async function runGenerate(userPrompt?: string) {
    setIsGenerating(true)
    setStatusPhase('favorites')
    setError('')
    setSavedUrl('')

    const acceptedIds = tracks.filter((t) => t.status === 'accepted').map((t) => t.tidal_id)
    const rejectedIds = tracks.filter((t) => t.status === 'rejected').map((t) => t.tidal_id)
    const newMessages = [...createMessages, { role: 'user' as const, content: userPrompt || 'Generate playlist' }]

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: createMessages, acceptedIds, rejectedIds, prompt: userPrompt, mood: selectedMood }),
      })
      if (!res.body) throw new Error('No response body')
      await consumeStream(res.body)
      setCreateMessages([...newMessages, { role: 'assistant', content: '[generated]' }])
    } catch (e) {
      setError(String(e))
    } finally {
      setIsGenerating(false)
    }
  }

  // ---------- ENHANCE mode ----------

  async function selectPlaylistForEnhance(playlist: ExistingPlaylist) {
    setTargetPlaylist(playlist)
    setTracks([])
    setSavedUrl('')
    setEnhanceMessages([])
    setLoadingPlaylistTracks(true)
    setError('')
    let rawTracks: typeof playlistTracks = []
    try {
      const res = await fetch(`/api/tidal/playlists/${playlist.id}/tracks`)
      const data = res.ok ? await res.json() : { tracks: [] }
      rawTracks = (data.tracks ?? []) as Array<{ id: string; title: string; artist: string; cover_url?: string; url?: string }>
      setPlaylistTracks(rawTracks)
    } catch {
      setPlaylistTracks([])
    } finally {
      setLoadingPlaylistTracks(false)
    }
    // Auto-trigger enhancement with the freshly loaded tracks
    await runEnhanceWithPlaylist(playlist, rawTracks)
  }

  async function runEnhance(userPrompt?: string) {
    if (!targetPlaylist) return
    await runEnhanceWithPlaylist(targetPlaylist, playlistTracks, userPrompt)
  }

  async function runEnhanceWithPlaylist(
    playlist: ExistingPlaylist,
    pTracks: typeof playlistTracks,
    userPrompt?: string
  ) {
    setIsGenerating(true)
    setStatusPhase('favorites')
    setError('')
    setSavedUrl('')

    const acceptedIds = tracks.filter((t) => t.status === 'accepted').map((t) => t.tidal_id)
    const rejectedIds = tracks.filter((t) => t.status === 'rejected').map((t) => t.tidal_id)
    const newMessages = [...enhanceMessages, { role: 'user' as const, content: userPrompt || 'Suggest additions' }]

    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId: playlist.id,
          playlistTitle: playlist.title,
          playlistTracks: pTracks,
          messages: enhanceMessages,
          acceptedIds,
          rejectedIds,
          prompt: userPrompt,
        }),
      })
      if (!res.body) throw new Error('No response body')
      await consumeStream(res.body)
      setEnhanceMessages([...newMessages, { role: 'assistant', content: '[enhanced]' }])
    } catch (e) {
      setError(String(e))
    } finally {
      setIsGenerating(false)
    }
  }

  // ---------- Shared stream consumer ----------

  async function consumeStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event: StreamEvent = JSON.parse(line.slice(6))
          if (event.type === 'status') setStatusPhase(event.phase)
          else if (event.type === 'tracks') mergeIncomingTracks(event.tracks)
          else if (event.type === 'error') setError(event.message)
        } catch {}
      }
    }
  }

  // ---------- Save / Add to playlist ----------

  async function savePlaylist(title: string) {
    const trackIds = tracks.filter((t) => t.status === 'accepted').map((t) => t.tidal_id)
    if (!trackIds.length) return
    setIsSaving(true)
    setSavedUrl('')
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: 'Generated by Tsunami', trackIds }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        setSavedUrl(`https://tidal.com/playlist/${data.playlist.id}`)
      } else {
        setError(data.error ?? 'Failed to save')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setIsSaving(false)
    }
  }

  async function addToPlaylist(_title: string) {
    if (!targetPlaylist) return
    const trackIds = tracks.filter((t) => t.status === 'accepted').map((t) => t.tidal_id)
    if (!trackIds.length) return
    setIsSaving(true)
    setSavedUrl('')
    try {
      const res = await fetch('/api/add-to-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId: targetPlaylist.id, trackIds }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        setSavedUrl(targetPlaylist.url || `https://tidal.com/playlist/${targetPlaylist.id}`)
      } else {
        setError(data.error ?? 'Failed to add tracks')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setIsSaving(false)
    }
  }

  // ---------- Render ----------

  if (appStatus === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500 text-sm">
        Connecting…
      </div>
    )
  }

  const hasPlaylist = tracks.length > 0
  const isEnhanceMode = mode === 'enhance'

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🌊</span>
            <span className="font-semibold tracking-tight">Tsunami</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">AI Playlist Curator</span>
          </div>
          {appStatus === 'connected' && tidalUser && (
            <div className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
              {tidalUser}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {appStatus === 'disconnected' ? (
          <ConnectTidal onConnected={checkAuth} />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Mode switcher */}
            <div className="flex rounded-xl border border-zinc-800 bg-zinc-900/40 p-1 gap-1">
              {(['create', 'enhance'] as AppMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                    mode === m
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {m === 'create' ? '✨ New Playlist' : '🎵 Enhance Existing'}
                </button>
              ))}
            </div>

            {/* Playlist tracks / suggestions */}
            {hasPlaylist && (
              <PlaylistView
                tracks={tracks}
                mood={selectedMood}
                onUpdateStatus={updateTrackStatus}
                onRejectAndRefresh={handleRejectAndRefresh}
                onSave={isEnhanceMode ? addToPlaylist : savePlaylist}
                saveLabel={isEnhanceMode ? `Add to "${targetPlaylist?.title}"` : undefined}
                isSaving={isSaving}
                savedUrl={savedUrl}
              />
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-800/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Dynamic middle section */}
            {isGenerating ? (
              <GeneratingView phase={statusPhase} />
            ) : isEnhanceMode ? (
              /* Enhance mode UI */
              targetPlaylist ? (
                hasPlaylist ? (
                  /* Compact back button + playlist name */
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setTargetPlaylist(null); setTracks([]); setSavedUrl('') }}
                      className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
                    >
                      ← Change playlist
                    </button>
                    <span className="text-xs text-zinc-600">·</span>
                    <span className="text-xs text-zinc-400">Enhancing: {targetPlaylist.title}</span>
                  </div>
                ) : loadingPlaylistTracks ? (
                  <div className="flex items-center gap-3 py-4 text-sm text-zinc-500">
                    <div className="h-4 w-4 rounded-full border-2 border-zinc-700 border-t-teal-400 animate-spin shrink-0" />
                    Loading playlist tracks…
                  </div>
                ) : null
              ) : (
                <PlaylistPicker onSelect={selectPlaylistForEnhance} />
              )
            ) : (
              /* Create mode UI */
              hasPlaylist ? (
                /* Compact mood strip */
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-zinc-600 uppercase tracking-wider">Refine by mood</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(MOOD_COLORS) as Mood[]).map((mood) => {
                      const isSelected = selectedMood === mood
                      return (
                        <button
                          key={mood}
                          onClick={() => setSelectedMood(isSelected ? null : mood)}
                          className="rounded-full px-3 py-1 text-xs font-medium capitalize transition-all duration-150"
                          style={{
                            background: isSelected ? MOOD_COLORS[mood] + '22' : 'transparent',
                            border: `1px solid ${isSelected ? MOOD_COLORS[mood] : 'rgba(255,255,255,0.1)'}`,
                            color: isSelected ? MOOD_COLORS[mood] : 'rgba(255,255,255,0.4)',
                          }}
                        >
                          {mood}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* Full mood wheel */
                <MoodSelector selected={selectedMood} onSelect={setSelectedMood} />
              )
            )}

            {/* Feedback bar — hidden in enhance mode when no playlist selected yet */}
            {!(isEnhanceMode && !targetPlaylist && !hasPlaylist) && (
              <FeedbackBar
                onSend={isEnhanceMode ? runEnhance : runGenerate}
                onRegenerate={() => (isEnhanceMode ? runEnhance() : runGenerate())}
                isGenerating={isGenerating}
                hasPlaylist={hasPlaylist}
                canGenerate={isEnhanceMode ? !!targetPlaylist : !!selectedMood}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
