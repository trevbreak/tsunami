import Anthropic from '@anthropic-ai/sdk'
import type { Track } from '@/types'
import type { LibraryTrack } from '@/lib/db'

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const TIDAL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_tidal_favorites',
    description: "Fetch the user's favorite/saved tracks from TIDAL to understand their music taste.",
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many tracks to fetch (default 50, max 100)' },
      },
    },
  },
  {
    name: 'get_tidal_recommendations',
    description:
      'Get TIDAL radio recommendations seeded from specific track IDs. Use this to discover tracks similar to what the user already likes.',
    input_schema: {
      type: 'object',
      properties: {
        track_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of TIDAL track IDs to seed recommendations from (pick 3-6 representative tracks)',
        },
        limit_per_track: {
          type: 'number',
          description: 'Recommendations per seed track (default 10)',
        },
      },
      required: ['track_ids'],
    },
  },
  {
    name: 'get_existing_playlist_track_ids',
    description:
      "Get track IDs from the user's existing TIDAL playlists. Call this to know which tracks the user already has so you can prioritize new discoveries.",
    input_schema: {
      type: 'object',
      properties: {
        max_playlists: {
          type: 'number',
          description: 'How many recent playlists to sample (default 5, max 10)',
        },
      },
    },
  },
]

export const RUN_TOOLS = TIDAL_TOOLS.filter((t) => t.name !== 'get_existing_playlist_track_ids')

export function buildRunSystemPrompt(params: {
  targetBpm: number
  bpmTolerance: number
  targetDurationSec: number
  label: string
  libraryPool?: LibraryTrack[]
  discoveryPool?: LibraryTrack[]
}): string {
  const { targetBpm, targetDurationSec, label, libraryPool = [], discoveryPool = [] } = params
  const targetMinutes = Math.ceil(targetDurationSec / 60)
  const halfTime = Math.round(targetBpm / 2)
  const twoThirds = Math.round((targetBpm * 2) / 3)
  const tol = 8

  const librarySection = libraryPool.length > 0
    ? `\nLIBRARY TRACKS VERIFIED BPM-COMPATIBLE (${libraryPool.length} tracks):
These tracks are from the user's own library and have been confirmed BPM-compatible. PRIORITISE these — use them as your primary source before calling tools.
${libraryPool.slice(0, 120).map((t) => {
  const w = Math.abs(t.bpm! - halfTime) <= tol ? 'half-time' : Math.abs(t.bpm! - twoThirds) <= tol ? 'two-thirds' : 'full-cadence'
  return `  { "tidal_id": "${t.id}", "title": "${t.title}", "artist": "${t.artist}", "bpm": ${t.bpm}, "window": "${w}"${t.is_favorite ? ', "favorite": true' : ''} }`
}).join('\n')}${libraryPool.length > 120 ? `\n  ... and ${libraryPool.length - 120} more` : ''}\n`
    : ''

  const discoverySection = discoveryPool.length > 0
    ? `\nDISCOVERY TRACKS (from My Daily Discovery / New Arrivals — BPM-compatible):
Include 1-2 of these to introduce fresh music (5-10% of playlist). Only use if they fit the energy.
${discoveryPool.slice(0, 20).map((t) =>
  `  { "tidal_id": "${t.id}", "title": "${t.title}", "artist": "${t.artist}", "bpm": ${t.bpm} }`
).join('\n')}\n`
    : ''

  const toolInstruction = libraryPool.length > 0
    ? `TOOLS (use only if library tracks are insufficient to fill the playlist duration):
- get_tidal_favorites: Understand taste profile for additional recommendations
- get_tidal_recommendations: Discover more BPM-compatible tracks seeded from library tracks`
    : `TOOLS:
- get_tidal_favorites: Fetch user's saved tracks to understand taste (genres, artists, energy)
- get_tidal_recommendations: Discover tracks seeded from tempo-appropriate tracks`

  const workflow = libraryPool.length > 0
    ? `WORKFLOW:
1. Start by selecting from LIBRARY TRACKS above — fill as much playlist time as possible with these
2. If library tracks fall short of ${targetMinutes} minutes, call get_tidal_favorites to understand taste, then get_tidal_recommendations seeded from the best-matching library tracks
3. Include 1-2 DISCOVERY TRACKS if present and energy-appropriate
4. Apply genre/energy rules below to all tracks regardless of source`
    : `WORKFLOW:
1. Call get_tidal_favorites (limit: 100) to analyze the user's taste profile
2. From favorites, identify tracks in the HALF-TIME range (${halfTime - tol}–${halfTime + tol} BPM) — aim for 3-4 seeds
3. Call get_tidal_recommendations seeded from those half-time tracks
4. If more variety is needed, identify tracks in the TWO-THIRDS range (${twoThirds - tol}–${twoThirds + tol} BPM) and seed again
5. Select tracks prioritising: half-time first, then two-thirds, then full cadence
6. Keep selecting until total track duration ≥ ${targetDurationSec} seconds`

  return `You are a running playlist curator for Tsunami. Build a playlist that keeps a runner on pace by matching music rhythm to their running cadence.

MISSION: ${label}
Runner's cadence: ${targetBpm} BPM
Target playlist duration: ${targetMinutes} minutes
${librarySection}${discoverySection}
TEMPO MATCHING — CRITICAL:
Most music does not exist at running cadence speeds (${targetBpm} BPM). Instead, use these three rhythmically compatible BPM windows — the runner's body naturally synchronises to musical subdivisions and the playlist feels locked-in:

1. HALF-TIME (÷2): ${halfTime - tol}–${halfTime + tol} BPM  ← PRIMARY TARGET — richest music pool
   Every beat aligns with every other footfall. Rock, alternative, soul, pop, hip-hop live here.

2. TWO-THIRDS (⅔): ${twoThirds - tol}–${twoThirds + tol} BPM  ← SECONDARY TARGET
   Every 3 beats = 2 footfalls (3:2 groove). Pop, dance, and upbeat genres work here.

3. FULL CADENCE (1:1): ${targetBpm - tol}–${targetBpm + tol} BPM  ← FALLBACK
   Exact match. Rare outside EDM, techno, drum & bass.

${toolInstruction}

${workflow}

RULES:
- At least 40% of tracks should reflect the user's taste profile (familiar artists/genres from favorites)
- Maintain consistent energy — avoid jarring mood shifts between consecutive tracks
- Do NOT include tracks with spoken-word intros, comedy skits, or stop/start dynamics
- Include a "reason" field per track noting the BPM window used
  Examples: "~${halfTime} BPM half-time — locks in at every other footfall, driving energy"
            "~${twoThirds} BPM two-thirds groove — 3:2 rhythm, high-energy pop"

RESPONSE FORMAT:
Output the playlist as a fenced JSON block:

\`\`\`tracks
[
  { "tidal_id": "123456", "title": "Track Title", "artist": "Artist Name", "reason": "~${halfTime} BPM half-time, driving rock" },
  ...
]
\`\`\`

You MUST include enough tracks to reach ${targetMinutes} minutes total duration.`
}

export const MOOD_DESCRIPTIONS: Record<string, string> = {
  romance: 'tender, intimate, warm — love songs and emotional connection',
  energetic: 'high-energy, driving, intense — workout fuel and adrenaline',
  chill: 'laid-back, mellow, atmospheric — sunset vibes and easy listening',
  melancholy: 'introspective, bittersweet, emotional depth — minor keys and vulnerability',
  focus: 'minimal, repetitive, non-distracting — deep work and concentration',
  party: 'dance floor ready, upbeat, celebratory — fun and euphoric',
}

export const SYSTEM_PROMPT = `You are a personalized music curator focused on expanding the user's musical horizons.

TOOLS:
- get_tidal_favorites: Always call this first to understand taste (genres, eras, artists)
- get_tidal_recommendations: Discover new music seeded from 3-6 representative tracks
- get_existing_playlist_track_ids: Check what tracks the user already owns to avoid duplicates

WORKFLOW:
1. Call get_tidal_favorites to analyze the user's taste
2. Call get_existing_playlist_track_ids to know what tracks to avoid repeating
3. Pick 3-5 seed tracks from favorites that fit the requested mood/vibe
4. Call get_tidal_recommendations to find new music
5. Cross-reference with any Reddit context provided
6. Curate a 15-20 track playlist

DISCOVERY MANDATE (critical):
More than 50% of suggested tracks MUST be tracks NOT found in the user's existing playlist track IDs.
- Favor lesser-known artists and deep cuts over obvious hits
- A good playlist: ~35% familiar favorites from loved artists + ~65% new discoveries
- Do NOT just suggest the most popular songs by the user's favorite artists

MOOD GUIDANCE:
When a mood is specified, shape the entire playlist around that emotional quality. Every track should serve the mood — tempo, tone, lyrics, and energy must all fit.

RESPONSE FORMAT:
After your analysis, output the playlist as a fenced JSON block:

\`\`\`tracks
[
  { "tidal_id": "123456", "title": "Track Title", "artist": "Artist Name", "reason": "One sentence why this fits the mood and expands their taste" },
  ...
]
\`\`\`

Follow with 1-2 sentences summarizing the curation and mood direction.

ADAPTING TO FEEDBACK:
When the user rejects tracks or gives feedback, call get_tidal_recommendations again with different seeds.
Always keep accepted tracks in the list.`

export function parseTracksFromMessage(content: string): Track[] {
  const match = content.match(/```(?:tracks|json)\s*([\s\S]*?)```/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (t) =>
          (typeof t.tidal_id === 'string' || typeof t.id === 'string') &&
          typeof t.title === 'string' &&
          typeof t.artist === 'string'
      )
      .map((t) => ({ ...t, tidal_id: t.tidal_id ?? t.id }))
  } catch {
    return []
  }
}
