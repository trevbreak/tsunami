'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ConnectTidal from '@/components/ConnectTidal'
import PlaylistView from '@/components/PlaylistView'
import FeedbackBar from '@/components/FeedbackBar'
import MoodSelector from '@/components/MoodSelector'
import GeneratingView from '@/components/GeneratingView'
import PlaylistPicker from '@/components/PlaylistPicker'
import RunnerConfig from '@/components/RunnerConfig'
import { defaultPlaylistName } from '@/lib/playlistName'
import type { ExistingPlaylist, Message, Mood, PlaylistTrack, RunConfig, StreamEvent, Track } from '@/types'

type AppStatus = 'checking' | 'disconnected' | 'connected'
type AppMode = 'create' | 'enhance' | 'run'

function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `~${totalSec}s left`
  const min = Math.round(totalSec / 60)
  if (min < 60) return `~${min} min left`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `~${h}h ${m}m left` : `~${h}h left`
}

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

  // Run mode
  const [runConfig, setRunConfig] = useState<RunConfig | null>(null)

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

  // Track-swap state (remove a track → suggest fitting alternatives)
  const [swapForId, setSwapForId] = useState<string | null>(null)
  const [alternatives, setAlternatives] = useState<Track[]>([])
  const [loadingAlternatives, setLoadingAlternatives] = useState(false)

  // Library sync state
  const [libraryStatus, setLibraryStatus] = useState<{
    synced: boolean; trackCount: number; lastSync: string | null; bpmTracksCount: number
  } | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncProgress, setSyncProgress] = useState<{ phase: string; current: number; total: number } | null>(null)
  const [syncEta, setSyncEta] = useState('')

  const bpmStartRef = useRef<{ t: number; base: number } | null>(null)

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { fetchLibraryStatus() }, [])
  // Any new generation invalidates an open swap panel.
  useEffect(() => { if (isGenerating) closeSwap() }, [isGenerating])

  async function fetchLibraryStatus() {
    try {
      const res = await fetch('/api/library/status')
      if (res.ok) setLibraryStatus(await res.json())
    } catch {}
  }

  const triggerSync = useCallback(async (mode: 'full' | 'incremental' = 'incremental') => {
    if (isSyncing) return
    setIsSyncing(true)
    setSyncMessage('Starting…')
    setSyncProgress(null)
    setSyncEta('')
    bpmStartRef.current = null
    try {
      const res = await fetch('/api/library/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'progress') {
              setSyncMessage(ev.message)
              if (typeof ev.current === 'number' && typeof ev.total === 'number' && ev.total > 0) {
                setSyncProgress({ phase: ev.phase, current: ev.current, total: ev.total })
                if (ev.phase === 'bpm') {
                  if (!bpmStartRef.current) {
                    bpmStartRef.current = { t: Date.now(), base: ev.current }
                  }
                  const done = ev.current - bpmStartRef.current.base
                  if (done > 0) {
                    const perTrack = (Date.now() - bpmStartRef.current.t) / done
                    setSyncEta(formatEta(perTrack * Math.max(0, ev.total - ev.current)))
                  }
                } else {
                  setSyncEta('')
                }
              } else {
                setSyncProgress(null)
                setSyncEta('')
              }
            } else if (ev.type === 'done') {
              setSyncMessage(`Done — ${ev.tracksAdded} new, ${ev.tracksUpdated} updated`)
              setSyncProgress(null)
              setSyncEta('')
              bpmStartRef.current = null
              await fetchLibraryStatus()
            } else if (ev.type === 'error') {
              setSyncMessage(`Error: ${ev.message}`)
              setSyncProgress(null)
              setSyncEta('')
            }
          } catch {}
        }
      }
    } catch (e) {
      setSyncMessage(`Failed: ${String(e)}`)
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing])

  // When mode changes, reset tracks and saved state
  useEffect(() => {
    setTracks([])
    setSavedUrl('')
    setError('')
    setTargetPlaylist(null)
    setPlaylistTracks([])
    setRunConfig(null)
    closeSwap()
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

  function mergeIncomingTracks(incoming: Track[], defaultStatus: 'pending' | 'accepted' = 'pending') {
    setTracks((prev) => {
      const prevMap = new Map(prev.map((t) => [t.tidal_id, t]))
      return incoming.map((t) => ({
        ...t,
        status: prevMap.get(t.tidal_id)?.status ?? defaultStatus,
      }))
    })
  }

  function updateTrackStatus(tidalId: string, status: 'accepted' | 'rejected') {
    setTracks((prev) => prev.map((t) => (t.tidal_id === tidalId ? { ...t, status } : t)))
  }

  function closeSwap() {
    setSwapForId(null)
    setAlternatives([])
    setLoadingAlternatives(false)
  }

  // Removing a track first offers alternatives that suit its slot.
  async function requestAlternatives(tidalId: string) {
    if (swapForId === tidalId) { closeSwap(); return } // toggle off
    setSwapForId(tidalId)
    setAlternatives([])
    setLoadingAlternatives(true)

    const visible = tracks.filter((t) => t.status !== 'rejected')
    const idx = visible.findIndex((t) => t.tidal_id === tidalId)
    const neighborIds = [visible[idx - 1]?.tidal_id, visible[idx + 1]?.tidal_id].filter(
      (id): id is string => !!id
    )
    const excludeIds = tracks.map((t) => t.tidal_id)

    try {
      const res = await fetch('/api/alternatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          removedTrackId: tidalId,
          neighborIds,
          excludeIds,
          runConfig: mode === 'run' ? runConfig : undefined,
        }),
      })
      const data = await res.json()
      // Ignore if the user moved on to a different track meanwhile.
      setSwapForId((cur) => {
        if (cur === tidalId) setAlternatives(data.alternatives ?? [])
        return cur
      })
    } catch {
      setAlternatives([])
    } finally {
      setLoadingAlternatives(false)
    }
  }

  // Replace the track in place (same slot) so the surrounding flow is preserved.
  function swapTrack(oldId: string, alt: Track) {
    setTracks((prev) =>
      prev.map((t) => (t.tidal_id === oldId ? { ...alt, status: 'accepted' as const } : t))
    )
    closeSwap()
  }

  function removeTrackEntirely(tidalId: string) {
    updateTrackStatus(tidalId, 'rejected')
    closeSwap()
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

  // ---------- RUN mode ----------

  async function runRun(userPrompt?: string, configOverride?: RunConfig) {
    const cfg = configOverride ?? runConfig
    if (!cfg) return
    setIsGenerating(true)
    setStatusPhase('favorites')
    setError('')
    setSavedUrl('')

    const acceptedIds = tracks.filter((t) => t.status === 'accepted').map((t) => t.tidal_id)
    const rejectedIds = tracks.filter((t) => t.status === 'rejected').map((t) => t.tidal_id)

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg, acceptedIds, rejectedIds, prompt: userPrompt }),
      })
      if (!res.body) throw new Error('No response body')
      await consumeStream(res.body, 'accepted')
    } catch (e) {
      setError(String(e))
    } finally {
      setIsGenerating(false)
    }
  }

  // ---------- Shared stream consumer ----------

  async function consumeStream(body: ReadableStream<Uint8Array>, defaultStatus: 'pending' | 'accepted' = 'pending') {
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
          else if (event.type === 'tracks') mergeIncomingTracks(event.tracks, defaultStatus)
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
      <div className="flex h-screen items-center justify-center text-white/60 text-sm">
        Connecting…
      </div>
    )
  }

  const hasPlaylist = tracks.length > 0
  const isEnhanceMode = mode === 'enhance'

  return (
    <div className="min-h-screen text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🌊</span>
            <span className="font-bold tracking-tight gradient-text">Tsunami</span>
            <span className="hidden text-xs text-white/40 sm:inline">· AI Playlist Curator</span>
          </div>
          <div className="flex items-center gap-2">
            {appStatus === 'connected' && libraryStatus !== null && (
              <button
                onClick={() => triggerSync(libraryStatus.synced ? 'incremental' : 'full')}
                disabled={isSyncing}
                title={isSyncing ? syncMessage : libraryStatus.synced ? `Sync library · ${libraryStatus.bpmTracksCount.toLocaleString()} tracks with BPM` : 'Library not synced — click to sync'}
                className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 disabled:opacity-60"
              >
                {isSyncing ? (
                  <span className="h-2.5 w-2.5 rounded-full border border-white/30 border-t-fuchsia-300 animate-spin shrink-0" />
                ) : (
                  <span className={`text-[10px] ${libraryStatus.synced ? 'text-white/50' : 'text-amber-400'}`}>↻</span>
                )}
                {isSyncing ? (
                  <span className="hidden sm:inline max-w-[140px] truncate">{syncMessage}</span>
                ) : libraryStatus.synced ? (
                  <span className="hidden sm:inline">{libraryStatus.trackCount.toLocaleString()} tracks</span>
                ) : (
                  <span className="hidden sm:inline text-amber-400/90">Sync library</span>
                )}
              </button>
            )}
            {appStatus === 'connected' && tidalUser && (
              <div className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                {tidalUser}
              </div>
            )}
          </div>
        </div>
      </header>

      {isSyncing && syncProgress && (
        <div className="sticky top-[49px] z-10 border-b border-white/10 bg-black/30 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl px-4 py-2.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-white/80 truncate">
                {syncProgress.phase === 'bpm' ? '🎚️ Analysing BPM' : '↻ Syncing library'} — {syncProgress.current.toLocaleString()} of {syncProgress.total.toLocaleString()}
              </span>
              {syncEta && <span className="shrink-0 tabular-nums text-white/50">{syncEta}</span>}
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (syncProgress.current / syncProgress.total) * 100)}%`, background: 'linear-gradient(90deg,#38bdf8,#a855f7)' }}
              />
            </div>
            {syncProgress.phase === 'bpm' && (
              <p className="mt-1 text-[11px] text-white/45">
                One-time analysis — keep this window open. Your library is being prepared for BPM-matched running playlists.
              </p>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-4 py-8">
        {appStatus === 'disconnected' ? (
          <ConnectTidal onConnected={checkAuth} />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Mode switcher */}
            <div className="flex gap-1.5 rounded-2xl border border-white/12 bg-white/5 p-1.5 backdrop-blur">
              {(['create', 'enhance', 'run'] as AppMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200"
                  style={mode === m
                    ? { background: 'linear-gradient(135deg,#38bdf8,#a855f7)', color: '#fff', boxShadow: '0 8px 22px -8px rgba(168,85,247,0.7)' }
                    : { color: 'rgba(255,255,255,0.6)' }}
                >
                  {m === 'create' ? '✨ New Playlist' : m === 'enhance' ? '🎵 Enhance Existing' : '🏃 Run'}
                </button>
              ))}
            </div>

            {/* Playlist tracks / suggestions */}
            {hasPlaylist && (
              <PlaylistView
                tracks={tracks}
                mood={selectedMood}
                defaultTitle={defaultPlaylistName({ mode, mood: selectedMood, runConfig, enhanceTitle: targetPlaylist?.title })}
                onUpdateStatus={updateTrackStatus}
                onRequestSwap={requestAlternatives}
                swapForId={swapForId}
                alternatives={alternatives}
                loadingAlternatives={loadingAlternatives}
                onSwap={swapTrack}
                onRemoveEntirely={removeTrackEntirely}
                onCancelSwap={closeSwap}
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
            ) : mode === 'run' ? (
              /* Run mode UI */
              hasPlaylist ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setRunConfig(null); setTracks([]); setSavedUrl('') }}
                    className="text-xs text-white/50 hover:text-white transition-colors"
                  >
                    ← Change settings
                  </button>
                  <span className="text-xs text-white/30">·</span>
                  <span className="text-xs text-white/70">{runConfig?.label}</span>
                </div>
              ) : (
                <RunnerConfig onGenerate={(cfg) => { setRunConfig(cfg); runRun(undefined, cfg) }} />
              )
            ) : isEnhanceMode ? (
              /* Enhance mode UI */
              targetPlaylist ? (
                hasPlaylist ? (
                  /* Compact back button + playlist name */
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setTargetPlaylist(null); setTracks([]); setSavedUrl('') }}
                      className="text-xs text-white/50 hover:text-white transition-colors"
                    >
                      ← Change playlist
                    </button>
                    <span className="text-xs text-white/30">·</span>
                    <span className="text-xs text-white/70">Enhancing: {targetPlaylist.title}</span>
                  </div>
                ) : loadingPlaylistTracks ? (
                  <div className="flex items-center gap-3 py-4 text-sm text-white/60">
                    <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-fuchsia-300 animate-spin shrink-0" />
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
                  <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">Refine by mood</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(MOOD_COLORS) as Mood[]).map((mood) => {
                      const isSelected = selectedMood === mood
                      return (
                        <button
                          key={mood}
                          onClick={() => setSelectedMood(isSelected ? null : mood)}
                          className="rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-all duration-150"
                          style={{
                            background: isSelected ? MOOD_COLORS[mood] + '33' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${isSelected ? MOOD_COLORS[mood] : 'rgba(255,255,255,0.14)'}`,
                            color: isSelected ? '#fff' : 'rgba(255,255,255,0.6)',
                            boxShadow: isSelected ? `0 6px 18px -6px ${MOOD_COLORS[mood]}` : 'none',
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

            {/* Feedback bar — hidden when no context to generate from yet */}
            {!(isEnhanceMode && !targetPlaylist && !hasPlaylist) && !(mode === 'run' && !hasPlaylist) && (
              <FeedbackBar
                onSend={mode === 'run' ? runRun : isEnhanceMode ? runEnhance : runGenerate}
                onRegenerate={() => mode === 'run' ? runRun() : isEnhanceMode ? runEnhance() : runGenerate()}
                isGenerating={isGenerating}
                hasPlaylist={hasPlaylist}
                canGenerate={mode === 'run' ? !!runConfig : isEnhanceMode ? !!targetPlaylist : !!selectedMood}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
