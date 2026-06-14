export type Mood = 'romance' | 'energetic' | 'chill' | 'melancholy' | 'focus' | 'party'

export interface Track {
  tidal_id: string
  title: string
  artist: string
  album?: string
  duration?: number
  reason?: string
  cover_url?: string
  tidal_url?: string
}

export type TrackStatus = 'pending' | 'accepted' | 'rejected'

export interface PlaylistTrack extends Track {
  status: TrackStatus
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface GenerateRequest {
  messages: Message[]
  acceptedIds: string[]
  rejectedIds: string[]
  prompt?: string
  mood?: Mood
}

export interface RunConfig {
  targetBpm: number
  bpmTolerance: number
  targetDurationSec: number
  label: string
}

export interface ExistingPlaylist {
  id: string
  title: string
  description: string
  track_count: number
  last_updated: string | null
  url: string
}

export interface RedditPost {
  title: string
  url: string
  subreddit: string
  score: number
  selftext?: string
}

export type StreamEvent =
  | { type: 'status'; phase: string; message: string }
  | { type: 'tracks'; tracks: Track[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface AlternativesRequest {
  mode: 'create' | 'enhance' | 'run'
  /** The track the user is removing — alternatives should suit its slot. */
  removedTrackId: string
  /** Adjacent track IDs (for context-aware radio seeding in create/enhance). */
  neighborIds?: string[]
  /** Tracks already in the playlist or previously rejected — never suggest these. */
  excludeIds: string[]
  /** Present in run mode: target cadence to match if the removed track has no local BPM. */
  runConfig?: RunConfig
}

export interface AlternativesResponse {
  alternatives: Track[]
}
