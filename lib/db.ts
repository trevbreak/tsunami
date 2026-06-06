import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'library.db')

let _db: Database.Database | null = null

export interface LibraryTrack {
  id: string
  title: string
  artist: string
  album: string | null
  duration: number | null
  bpm: number | null
  cover_url: string | null
  tidal_url: string | null
  isrc: string | null
  popularity: number | null
  explicit: number
  audio_quality: string | null
  release_date: string | null
  is_favorite: number
}

export function getDb(): Database.Database {
  if (_db) return _db

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT,
      duration INTEGER,
      bpm INTEGER,
      cover_url TEXT,
      tidal_url TEXT,
      isrc TEXT,
      popularity INTEGER,
      explicit INTEGER DEFAULT 0,
      audio_quality TEXT,
      release_date TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      track_count INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 0,
      last_updated TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_run_playlist INTEGER DEFAULT 0,
      is_discovery INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      PRIMARY KEY (playlist_id, track_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
      track_id TEXT PRIMARY KEY,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      tracks_added INTEGER DEFAULT 0,
      tracks_updated INTEGER DEFAULT 0,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);
  `)
}

export function upsertTrack(track: {
  id: string; title: string; artist: string; album?: string | null;
  duration?: number | null; bpm?: number | null; cover_url?: string | null;
  tidal_url?: string | null; isrc?: string | null; popularity?: number | null;
  explicit?: boolean | null; audio_quality?: string | null; release_date?: string | null
}): 'inserted' | 'updated' {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM tracks WHERE id = ?').get(track.id)
  db.prepare(`
    INSERT OR REPLACE INTO tracks
      (id, title, artist, album, duration, bpm, cover_url, tidal_url, isrc, popularity, explicit, audio_quality, release_date, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    track.id, track.title, track.artist,
    track.album ?? null, track.duration ?? null, track.bpm ?? null,
    track.cover_url ?? null, track.tidal_url ?? null,
    track.isrc ?? null, track.popularity ?? null,
    track.explicit ? 1 : 0,
    track.audio_quality ?? null, track.release_date ?? null
  )
  return existing ? 'updated' : 'inserted'
}

export function upsertPlaylist(playlist: {
  id: string; title: string; description?: string | null;
  track_count?: number; duration?: number; last_updated?: string | null
}): void {
  const db = getDb()
  const isRun = /run/i.test(playlist.title) ? 1 : 0
  const isDiscovery = /daily discovery|new arrivals|my mix/i.test(playlist.title) ? 1 : 0
  db.prepare(`
    INSERT OR REPLACE INTO playlists
      (id, title, description, track_count, duration, last_updated, synced_at, is_run_playlist, is_discovery)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `).run(
    playlist.id, playlist.title, playlist.description ?? null,
    playlist.track_count ?? 0, playlist.duration ?? 0,
    playlist.last_updated ?? null, isRun, isDiscovery
  )
}

export function clearPlaylistTracks(playlistId: string): void {
  getDb().prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId)
}

export function addPlaylistTracks(
  playlistId: string,
  tracks: Array<{ id: string; position: number }>
): void {
  const db = getDb()
  const insert = db.prepare(
    'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)'
  )
  const insertBatch = db.transaction(() => {
    for (const t of tracks) insert.run(playlistId, t.id, t.position)
  })
  insertBatch()
}

export function setFavorites(trackIds: string[]): void {
  const db = getDb()
  const insertFav = db.prepare(
    "INSERT OR IGNORE INTO favorites (track_id, synced_at) VALUES (?, datetime('now'))"
  )
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM favorites').run()
    for (const id of trackIds) insertFav.run(id)
  })
  replace()
}

export function getTracksByBpmRange(minBpm: number, maxBpm: number): LibraryTrack[] {
  return (getDb().prepare(`
    SELECT t.*, CASE WHEN f.track_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
    FROM tracks t
    LEFT JOIN favorites f ON f.track_id = t.id
    WHERE t.bpm BETWEEN ? AND ?
    ORDER BY t.popularity DESC NULLS LAST
  `).all(minBpm, maxBpm) as LibraryTrack[])
}

export function getFavoriteLibraryTracks(): LibraryTrack[] {
  return (getDb().prepare(`
    SELECT t.*, 1 as is_favorite
    FROM tracks t
    INNER JOIN favorites f ON f.track_id = t.id
    ORDER BY f.synced_at DESC
  `).all() as LibraryTrack[])
}

export function getRunPlaylistTracks(): LibraryTrack[] {
  return (getDb().prepare(`
    SELECT DISTINCT t.*, CASE WHEN f.track_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
    FROM tracks t
    INNER JOIN playlist_tracks pt ON pt.track_id = t.id
    INNER JOIN playlists p ON p.id = pt.playlist_id
    LEFT JOIN favorites f ON f.track_id = t.id
    WHERE p.is_run_playlist = 1
    ORDER BY t.popularity DESC NULLS LAST
  `).all() as LibraryTrack[])
}

export function getDiscoveryTracks(): LibraryTrack[] {
  return (getDb().prepare(`
    SELECT DISTINCT t.*, CASE WHEN f.track_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
    FROM tracks t
    INNER JOIN playlist_tracks pt ON pt.track_id = t.id
    INNER JOIN playlists p ON p.id = pt.playlist_id
    LEFT JOIN favorites f ON f.track_id = t.id
    WHERE p.is_discovery = 1
    ORDER BY t.popularity DESC NULLS LAST
  `).all() as LibraryTrack[])
}

export function getLibraryStatus(): {
  trackCount: number
  favoriteCount: number
  playlistCount: number
  bpmTracksCount: number
  lastSync: string | null
} {
  const db = getDb()
  const trackCount = (db.prepare('SELECT COUNT(*) as n FROM tracks').get() as { n: number }).n
  const favoriteCount = (db.prepare('SELECT COUNT(*) as n FROM favorites').get() as { n: number }).n
  const playlistCount = (db.prepare('SELECT COUNT(*) as n FROM playlists').get() as { n: number }).n
  const bpmTracksCount = (db.prepare(
    'SELECT COUNT(*) as n FROM tracks WHERE bpm IS NOT NULL AND bpm > 0'
  ).get() as { n: number }).n
  const lastSyncRow = db.prepare(
    "SELECT completed_at FROM sync_log WHERE error IS NULL ORDER BY id DESC LIMIT 1"
  ).get() as { completed_at: string } | undefined
  return { trackCount, favoriteCount, playlistCount, bpmTracksCount, lastSync: lastSyncRow?.completed_at ?? null }
}

export function startSyncLog(type: 'full' | 'incremental'): number {
  const result = getDb().prepare(
    "INSERT INTO sync_log (type, started_at) VALUES (?, datetime('now'))"
  ).run(type)
  return result.lastInsertRowid as number
}

export function completeSyncLog(
  id: number,
  stats: { tracksAdded: number; tracksUpdated: number },
  error?: string
): void {
  getDb().prepare(
    "UPDATE sync_log SET completed_at = datetime('now'), tracks_added = ?, tracks_updated = ?, error = ? WHERE id = ?"
  ).run(stats.tracksAdded, stats.tracksUpdated, error ?? null, id)
}

export function getPlaylistSyncState(): Map<string, string | null> {
  const rows = getDb().prepare('SELECT id, last_updated FROM playlists').all() as Array<{
    id: string; last_updated: string | null
  }>
  const map = new Map<string, string | null>()
  rows.forEach(r => map.set(r.id, r.last_updated))
  return map
}

export function dbExists(): boolean {
  return fs.existsSync(DB_PATH)
}
