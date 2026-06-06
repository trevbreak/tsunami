import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { anthropic, TIDAL_TOOLS, SYSTEM_PROMPT, MOOD_DESCRIPTIONS, parseTracksFromMessage } from '@/lib/claude'
import { getFavoriteTracks, getBatchRecommendations, getUserPlaylists, getPlaylistTracks } from '@/lib/tidal'
import { getMusicRecommendations, formatRedditContext } from '@/lib/reddit'
import { dbExists, getFavoriteLibraryTracks } from '@/lib/db'
import type { Message, Mood } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

const TOOL_STATUS: Record<string, { phase: string; message: string }> = {
  get_tidal_favorites: { phase: 'favorites', message: 'Reading your music taste…' },
  get_existing_playlist_track_ids: { phase: 'playlists', message: 'Scanning your library…' },
  get_tidal_recommendations: { phase: 'discovering', message: 'Exploring the music universe…' },
}

function encode(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

function captureUrls(
  data: unknown,
  coverMap: Map<string, string>,
  urlMap: Map<string, string>
) {
  if (!data || typeof data !== 'object') return
  const tracks =
    (data as Record<string, unknown>).tracks ??
    (data as Record<string, unknown>).recommendations ??
    []
  if (!Array.isArray(tracks)) return
  for (const t of tracks) {
    if (t?.id) {
      if (t.cover_url) coverMap.set(String(t.id), t.cover_url)
      if (t.url) urlMap.set(String(t.id), t.url)
    }
  }
}

async function handleToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  coverMap: Map<string, string>,
  urlMap: Map<string, string>
): Promise<string> {
  if (toolName === 'get_tidal_favorites') {
    if (dbExists()) {
      const libTracks = getFavoriteLibraryTracks()
      if (libTracks.length > 0) {
        const tracks = libTracks.slice(0, 200).map((t) => ({
          id: t.id, title: t.title, artist: t.artist, album: t.album,
          duration: t.duration, bpm: t.bpm, cover_url: t.cover_url, url: t.tidal_url,
        }))
        tracks.forEach((t) => { if (t.cover_url) coverMap.set(t.id, t.cover_url); if (t.url) urlMap.set(t.id, t.url) })
        return JSON.stringify({ tracks })
      }
    }
    const limit = (toolInput.limit as number) ?? 50
    const data = await getFavoriteTracks(limit)
    captureUrls(data, coverMap, urlMap)
    return JSON.stringify(data)
  }
  if (toolName === 'get_tidal_recommendations') {
    const trackIds = toolInput.track_ids as string[]
    const limitPerTrack = (toolInput.limit_per_track as number) ?? 10
    const data = await getBatchRecommendations(trackIds, limitPerTrack)
    captureUrls(data, coverMap, urlMap)
    return JSON.stringify(data)
  }
  if (toolName === 'get_existing_playlist_track_ids') {
    const maxPlaylists = Math.min((toolInput.max_playlists as number) ?? 5, 10)
    try {
      const { playlists } = await getUserPlaylists()
      const recent = playlists.slice(0, maxPlaylists)
      const allIds = new Set<string>()
      await Promise.all(
        recent.map(async (p) => {
          try {
            const { tracks } = await getPlaylistTracks(p.id, 100)
            tracks.forEach((t) => {
              allIds.add(t.id)
              if (t.cover_url) coverMap.set(t.id, t.cover_url)
              if (t.url) urlMap.set(t.id, t.url)
            })
          } catch {}
        })
      )
      return JSON.stringify({
        playlists_checked: recent.length,
        existing_track_ids: [...allIds],
        message: `Found ${allIds.size} tracks across ${recent.length} existing playlists. Ensure >50% of your suggestions are NOT in this list.`,
      })
    } catch {
      return JSON.stringify({ existing_track_ids: [], message: 'Could not fetch existing playlists.' })
    }
  }
  return JSON.stringify({ error: 'Unknown tool' })
}

export async function POST(req: NextRequest) {
  const { messages, acceptedIds, rejectedIds, prompt, mood } = await req.json() as {
    messages: Message[]
    acceptedIds: string[]
    rejectedIds: string[]
    prompt?: string
    mood?: Mood
  }

  // Maps populated from tool responses for enriching Claude's output
  const coverMap = new Map<string, string>()
  const urlMap = new Map<string, string>()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(new TextEncoder().encode(encode(event)))

      try {
        // Emit initial status
        send({ type: 'status', phase: 'favorites', message: 'Getting started…' })

        const redditPosts = await getMusicRecommendations()
        const redditContext = formatRedditContext(redditPosts)

        const moodLabel = mood ?? null
        const moodDesc = moodLabel ? MOOD_DESCRIPTIONS[moodLabel] : null
        const moodLine = moodDesc ? `MOOD: ${moodLabel!.toUpperCase()} — ${moodDesc}` : null

        let userContent = moodLine
          ? `${moodLine}\n\n${prompt || 'Generate a playlist that matches this mood, using my TIDAL history as a taste reference.'}`
          : prompt || 'Generate a playlist for me based on my TIDAL history and trending recommendations.'

        if (acceptedIds.length > 0 || rejectedIds.length > 0) {
          userContent += `\n\nFrom my last suggestion: I accepted ${acceptedIds.length} track(s) (IDs: ${acceptedIds.join(', ')}) and rejected ${rejectedIds.length} track(s) (IDs: ${rejectedIds.join(', ')}). Please keep accepted tracks and replace rejected ones.`
        }

        if (messages.length === 0) {
          userContent += `\n\n---\nCURRENT REDDIT MUSIC CONTEXT (top posts this week):\n${redditContext}`
        }

        const apiMessages: Anthropic.MessageParam[] = [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: userContent },
        ]

        let tracksEmitted = false
        let continueLoop = true
        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: TIDAL_TOOLS,
            messages: apiMessages,
          })

          for (const block of response.content) {
            if (block.type === 'text') {
              // Parse and emit tracks — enrich with cover/url data captured from tools
              const rawTracks = parseTracksFromMessage(block.text)
              if (rawTracks.length > 0) {
                send({ type: 'status', phase: 'curating', message: 'Handpicking tracks just for you…' })
                const enriched = rawTracks.map((t) => ({
                  ...t,
                  cover_url: t.cover_url || coverMap.get(t.tidal_id),
                  tidal_url: t.tidal_url || urlMap.get(t.tidal_id),
                }))
                send({ type: 'tracks', tracks: enriched })
                tracksEmitted = true
              }
            }
          }

          if (response.stop_reason === 'tool_use') {
            const toolResults: Anthropic.ToolResultBlockParam[] = []
            for (const block of response.content) {
              if (block.type === 'tool_use') {
                const status = TOOL_STATUS[block.name] ?? { phase: 'discovering', message: 'Working…' }
                send({ type: 'status', phase: status.phase, message: status.message })
                const result = await handleToolCall(
                  block.name,
                  block.input as Record<string, unknown>,
                  coverMap,
                  urlMap
                )
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
              }
            }
            apiMessages.push({ role: 'assistant', content: response.content })
            apiMessages.push({ role: 'user', content: toolResults })
          } else {
            continueLoop = false
          }
        }

        if (!tracksEmitted) {
          send({ type: 'error', message: 'No tracks could be generated. Try a different mood or give some feedback to guide the curation.' })
        } else {
          send({ type: 'done' })
        }
      } catch (err) {
        send({ type: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
