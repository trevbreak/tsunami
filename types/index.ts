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
