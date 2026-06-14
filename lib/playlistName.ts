/**
 * Default playlist names. The save mechanism (editable title → /api/save →
 * createPlaylist) already exists; this just produces a clean, human default per
 * mode so the user rarely needs to retype — and never sees the raw run-config
 * string ("5 km at 5:00/km (158 BPM)") as a playlist name.
 */
import type { Mood, RunConfig } from '@/types'

export const MOOD_TITLES: Record<Mood, string> = {
  romance: 'Tender Moments',
  energetic: 'High Energy Mix',
  chill: 'Chill Vibes',
  melancholy: 'Introspective',
  focus: 'Deep Focus',
  party: 'Party Mix',
}

/** "Jun 2026" */
export function monthYear(d: Date = new Date()): string {
  return d.toLocaleString('default', { month: 'short', year: 'numeric' })
}

/**
 * Friendly run prefix derived from the RunConfig label, e.g.
 *   "5 km at 5:00/km (158 BPM)" → "5 km Run · 158 BPM"
 *   "45m run at 175 BPM"        → "45m Run · 175 BPM"
 */
function runPrefix(config: RunConfig): string {
  const head = config.label.split(' at ')[0].split(/\s+run/i)[0].trim()
  const base = head ? `${head} Run` : 'Run'
  return `${base} · ${config.targetBpm} BPM`
}

export function defaultPlaylistName(opts: {
  mode: 'create' | 'enhance' | 'run'
  mood?: Mood | null
  runConfig?: RunConfig | null
  enhanceTitle?: string | null
}): string {
  const month = monthYear()
  if (opts.mode === 'run' && opts.runConfig) {
    return `${runPrefix(opts.runConfig)} · ${month}`
  }
  if (opts.mode === 'enhance' && opts.enhanceTitle) {
    return opts.enhanceTitle
  }
  if (opts.mood) {
    return `${MOOD_TITLES[opts.mood]} · ${month}`
  }
  return `Tsunami Mix · ${month}`
}
