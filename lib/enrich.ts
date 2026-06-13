/**
 * LLM enrichment at rest (Phase 2).
 *
 * Batches the user's library through Claude to label each track with genre,
 * mood, and audio-style estimates, stored in `track_features`. These power
 * content-based similarity and the sequencer's style smoothing — none of it runs
 * in the recommendation hot path. Incremental, like the BPM enrichment loop.
 */
import { anthropic } from './claude'
import { getTracksWithoutFeatures, upsertTrackFeatures } from './db'
import type { TrackFeatures } from './db'

const MODEL = 'claude-sonnet-4-6'
const BATCH_SIZE = 25

// Static system prompt → prompt-cached so each batch reuses it cheaply.
const ENRICH_SYSTEM = `You are a precise music metadata classifier. For each track you are given
(title + artist + album), infer attributes from your music knowledge.

For EACH track output an object with:
- "id": echo the track's id exactly
- "genre": one broad primary genre (e.g. "metal", "hip-hop", "indie rock", "electronic", "pop", "r&b", "jazz", "folk", "classical")
- "subgenre": a specific subgenre if confident, else null (e.g. "djent", "trap", "synthwave")
- "mood": one of romance | energetic | chill | melancholy | focus | party (closest fit)
- "energy": 0.0–1.0 (calm → intense)
- "valence": 0.0–1.0 (sad/dark → happy/bright)
- "danceability": 0.0–1.0
- "acousticness": 0.0–1.0 (electronic/produced → acoustic)
- "era": the decade as a string like "2020s", "2010s", "1990s", or null if unsure
- "instrumental": true if largely instrumental, else false
- "tags": array of 2–5 short descriptive tags

Use null when genuinely unsure; do not hallucinate specifics. Respond with ONLY a fenced
JSON array, no prose:
\`\`\`json
[ { "id": "123", "genre": "...", ... } ]
\`\`\``

interface RawFeature {
  id?: string
  genre?: string | null
  subgenre?: string | null
  mood?: string | null
  energy?: number | null
  valence?: number | null
  danceability?: number | null
  acousticness?: number | null
  era?: string | null
  instrumental?: boolean | null
  tags?: string[] | null
}

function parseFeatures(text: string): RawFeature[] {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = m ? m[1] : text
  try {
    const parsed = JSON.parse(body.trim())
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const clamp01 = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null
}

async function classifyBatch(
  batch: Array<{ id: string; title: string; artist: string; album: string | null }>
): Promise<TrackFeatures[]> {
  const list = batch
    .map((t) => `{ "id": "${t.id}", "title": ${JSON.stringify(t.title)}, "artist": ${JSON.stringify(t.artist)}, "album": ${JSON.stringify(t.album ?? '')} }`)
    .join('\n')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: ENRICH_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Classify these ${batch.length} tracks:\n${list}` }],
  })

  const text = response.content
    .filter((b): b is { type: 'text'; text: string } & typeof b => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const byId = new Map(batch.map((t) => [t.id, t]))
  const out: TrackFeatures[] = []
  for (const f of parseFeatures(text)) {
    if (!f.id || !byId.has(String(f.id))) continue
    out.push({
      track_id: String(f.id),
      genre: f.genre ?? null,
      subgenre: f.subgenre ?? null,
      mood: f.mood ?? null,
      energy: clamp01(f.energy),
      valence: clamp01(f.valence),
      danceability: clamp01(f.danceability),
      acousticness: clamp01(f.acousticness),
      era: f.era ?? null,
      instrumental: f.instrumental == null ? null : f.instrumental ? 1 : 0,
      tags: Array.isArray(f.tags) ? JSON.stringify(f.tags) : null,
    })
  }
  return out
}

export type EnrichEvent =
  | { done: false; enriched: number; total: number; message: string }
  | { done: true; enriched: number; failed: number; total: number }

export async function* runEnrichment(): AsyncGenerator<EnrichEvent> {
  const tracks = getTracksWithoutFeatures()
  const total = tracks.length
  let enriched = 0
  let failed = 0

  for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
    const batch = tracks.slice(i, i + BATCH_SIZE)
    try {
      const features = await classifyBatch(batch)
      for (const f of features) {
        upsertTrackFeatures({ ...f, model: MODEL })
        enriched++
      }
      // Tracks the model omitted still count as attempted, so the loop terminates.
      failed += batch.length - features.length
    } catch {
      failed += batch.length
    }
    yield { done: false, enriched, total, message: `Enriched ${enriched}/${total} tracks…` }
  }

  yield { done: true, enriched, failed, total }
}
