import Anthropic from '@anthropic-ai/sdk'
import type { Track } from '@/types'

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
  const match = content.match(/```tracks\s*([\s\S]*?)```/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (t) => typeof t.tidal_id === 'string' && typeof t.title === 'string' && typeof t.artist === 'string'
    )
  } catch {
    return []
  }
}
