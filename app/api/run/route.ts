import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { anthropic, RUN_TOOLS, buildRunSystemPrompt, parseTracksFromMessage } from '@/lib/claude'
import { getFavoriteTracks, getBatchRecommendations } from '@/lib/tidal'
import { dbExists, getTracksByBpmRange, getDiscoveryTracks } from '@/lib/db'
import type { RunConfig } from '@/types'
import type { LibraryTrack } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 120

const TOOL_STATUS: Record<string, { phase: string; message: string }> = {
  get_tidal_favorites: { phase: 'favorites', message: 'Reading your music taste…' },
  get_tidal_recommendations: { phase: 'discovering', message: 'Finding tracks at your pace…' },
}

function encode(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

function captureUrls(data: unknown, coverMap: Map<string, string>, urlMap: Map<string, string>) {
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
    const limit = (toolInput.limit as number) ?? 100
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
  return JSON.stringify({ error: 'Unknown tool' })
}

export async function POST(req: NextRequest) {
  const { config, acceptedIds, rejectedIds, prompt } = (await req.json()) as {
    config: RunConfig
    acceptedIds: string[]
    rejectedIds: string[]
    prompt?: string
  }

  const coverMap = new Map<string, string>()
  const urlMap = new Map<string, string>()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(new TextEncoder().encode(encode(event)))

      try {
        send({ type: 'status', phase: 'favorites', message: 'Getting started…' })

        // Pull BPM-matched tracks from local library if synced
        let libraryPool: LibraryTrack[] = []
        let discoveryPool: LibraryTrack[] = []
        if (dbExists()) {
          const halfBpm = Math.round(config.targetBpm / 2)
          const twoThirdsBpm = Math.round((config.targetBpm * 2) / 3)
          const tol = 8
          const seen = new Set<string>()
          for (const t of [
            ...getTracksByBpmRange(halfBpm - tol, halfBpm + tol),
            ...getTracksByBpmRange(twoThirdsBpm - tol, twoThirdsBpm + tol),
            ...getTracksByBpmRange(config.targetBpm - tol, config.targetBpm + tol),
          ]) {
            if (!seen.has(t.id)) { seen.add(t.id); libraryPool.push(t) }
          }
          discoveryPool = getDiscoveryTracks().filter(
            (t) => !seen.has(t.id) && t.bpm != null &&
              (Math.abs(t.bpm - halfBpm) <= tol ||
               Math.abs(t.bpm - twoThirdsBpm) <= tol ||
               Math.abs(t.bpm - config.targetBpm) <= tol)
          )
        }

        const systemPrompt = buildRunSystemPrompt({
          targetBpm: config.targetBpm,
          bpmTolerance: config.bpmTolerance,
          targetDurationSec: config.targetDurationSec,
          label: config.label,
          libraryPool,
          discoveryPool,
        })

        const targetMinutes = Math.ceil(config.targetDurationSec / 60)
        let userContent = `Build a running playlist: ${config.label}\nTarget: ${config.targetBpm} BPM (±${config.bpmTolerance}), ${targetMinutes} minutes total.`

        if (acceptedIds.length > 0 || rejectedIds.length > 0) {
          userContent += `\n\nFrom my last suggestion: I kept ${acceptedIds.length} track(s) (IDs: ${acceptedIds.join(', ')}) and skipped ${rejectedIds.length} track(s) (IDs: ${rejectedIds.join(', ')}). Keep accepted tracks and find replacements for the skipped ones.`
        }

        if (prompt) {
          userContent += `\n\nUser feedback: ${prompt}`
        }

        const apiMessages: Anthropic.MessageParam[] = [
          { role: 'user', content: userContent },
        ]

        let tracksEmitted = false
        let continueLoop = true
        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 8192,
            system: systemPrompt,
            tools: RUN_TOOLS,
            messages: apiMessages,
          })

          for (const block of response.content) {
            if (block.type === 'text') {
              const rawTracks = parseTracksFromMessage(block.text)
              if (rawTracks.length > 0) {
                send({ type: 'status', phase: 'curating', message: 'Assembling your run playlist…' })
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
          send({ type: 'error', message: 'No tracks could be generated. Try adjusting your BPM target or pace and try again.' })
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
