import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { anthropic, parseTracksFromMessage } from '@/lib/claude'
import { getBatchRecommendations } from '@/lib/tidal'
import type { Message } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

const ENHANCE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_tidal_recommendations',
    description: 'Get TIDAL radio recommendations seeded from specific track IDs.',
    input_schema: {
      type: 'object',
      properties: {
        track_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Seed track IDs (pick 4-6 representative tracks from the existing playlist)',
        },
        limit_per_track: {
          type: 'number',
          description: 'Recommendations per seed (default 12)',
        },
      },
      required: ['track_ids'],
    },
  },
]

const TOOL_STATUS: Record<string, { phase: string; message: string }> = {
  get_tidal_recommendations: { phase: 'discovering', message: 'Finding music that fits this playlist…' },
}

function buildSystemPrompt(
  playlistTitle: string,
  existingTrackLines: string,
  existingTrackCount: number
): string {
  return `You are a music curator enhancing a specific TIDAL playlist.

TARGET PLAYLIST: "${playlistTitle}" (${existingTrackCount} existing tracks)

EXISTING TRACKS (do NOT suggest these):
${existingTrackLines}

YOUR MISSION:
Analyze the playlist's musical DNA from its title and tracks. Understand what it's for — workout fuel, late night focus, a genre deep-dive, etc. Then find 10–15 new tracks that would feel like a natural, welcome addition.

DISCOVERY RULES:
- At least 60% of your suggestions must be artists NOT already in the playlist
- Do NOT include any track IDs already in the existing tracks list above
- Think about gaps: sub-genres, eras, tempos, or moods the playlist is missing

TOOL:
- get_tidal_recommendations: Seed with 4–6 representative existing tracks to discover similar music

WORKFLOW:
1. Pick 4–6 tracks that best represent the playlist's core sound
2. Call get_tidal_recommendations with those seeds
3. Filter results: exclude tracks already in the playlist (by ID)
4. Select 10–15 best suggestions

RESPONSE FORMAT:
\`\`\`tracks
[
  { "tidal_id": "123456", "title": "Track Title", "artist": "Artist Name", "reason": "Why this fits and what it adds" },
  ...
]
\`\`\`

Then 1–2 sentences about your curation choices.`
}

function encode(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export async function POST(req: NextRequest) {
  const { playlistId, playlistTitle, playlistTracks, messages, acceptedIds, rejectedIds, prompt } =
    await req.json() as {
      playlistId: string
      playlistTitle: string
      playlistTracks: Array<{ id: string; title: string; artist: string; cover_url?: string; url?: string }>
      messages: Message[]
      acceptedIds: string[]
      rejectedIds: string[]
      prompt?: string
    }

  const coverMap = new Map<string, string>()
  const urlMap = new Map<string, string>()

  // Pre-populate maps from the playlist tracks we already have
  for (const t of playlistTracks) {
    if (t.cover_url) coverMap.set(t.id, t.cover_url)
    if (t.url) urlMap.set(t.id, t.url)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(new TextEncoder().encode(encode(event)))

      try {
        send({ type: 'status', phase: 'favorites', message: 'Analysing the playlist…' })

        const existingIds = new Set(playlistTracks.map((t) => t.id))
        const existingTrackLines = playlistTracks
          .slice(0, 80)
          .map((t) => `  - ${t.title} by ${t.artist} [ID: ${t.id}]`)
          .join('\n')

        const systemPrompt = buildSystemPrompt(playlistTitle, existingTrackLines, playlistTracks.length)

        let userContent = prompt
          ? `${prompt}\n\nHere are my accepted/rejected tracks from the last round: accepted IDs [${acceptedIds.join(', ')}], rejected IDs [${rejectedIds.join(', ')}]. Keep accepted, replace rejected.`
          : `Please find great additions for my "${playlistTitle}" playlist.`

        const apiMessages: Anthropic.MessageParam[] = [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: userContent },
        ]

        let continueLoop = true
        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            tools: ENHANCE_TOOLS,
            messages: apiMessages,
          })

          for (const block of response.content) {
            if (block.type === 'text') {
              const rawTracks = parseTracksFromMessage(block.text)
              if (rawTracks.length > 0) {
                send({ type: 'status', phase: 'curating', message: 'Handpicking the best additions…' })
                const enriched = rawTracks
                  .filter((t) => !existingIds.has(t.tidal_id))
                  .map((t) => ({
                    ...t,
                    cover_url: t.cover_url || coverMap.get(t.tidal_id),
                    tidal_url: t.tidal_url || urlMap.get(t.tidal_id),
                  }))
                send({ type: 'tracks', tracks: enriched })
              }
            }
          }

          if (response.stop_reason === 'tool_use') {
            const toolResults: Anthropic.ToolResultBlockParam[] = []
            for (const block of response.content) {
              if (block.type === 'tool_use') {
                const status = TOOL_STATUS[block.name] ?? { phase: 'discovering', message: 'Working…' }
                send({ type: 'status', phase: status.phase, message: status.message })

                if (block.name === 'get_tidal_recommendations') {
                  const trackIds = (block.input as Record<string, unknown>).track_ids as string[]
                  const limitPerTrack =
                    ((block.input as Record<string, unknown>).limit_per_track as number) ?? 12
                  const data = await getBatchRecommendations(trackIds, limitPerTrack)
                  // Capture cover/URL data from recommendations
                  const recs = (data as Record<string, unknown>).recommendations
                  if (Array.isArray(recs)) {
                    for (const t of recs) {
                      if (t?.id) {
                        if (t.cover_url) coverMap.set(String(t.id), t.cover_url)
                        if (t.url) urlMap.set(String(t.id), t.url)
                      }
                    }
                  }
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: JSON.stringify(data),
                  })
                } else {
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: JSON.stringify({ error: 'Unknown tool' }),
                  })
                }
              }
            }
            apiMessages.push({ role: 'assistant', content: response.content })
            apiMessages.push({ role: 'user', content: toolResults })
          } else {
            continueLoop = false
          }
        }

        send({ type: 'done' })
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
