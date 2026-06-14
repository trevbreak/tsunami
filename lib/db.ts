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
  music_key: string | null
  key_scale: string | null
  album_id: string | null
  artist_id: string | null
  copyright: string | null
  is_favorite: number
}

/**
 * Normalise a TIDAL track ID to a clean numeric string.
 *
 * The TIDAL backend returns IDs as JSON numbers. If a JS number is bound to a
 * TEXT column, better-sqlite3/SQLite stores it via REAL→TEXT conversion as
 * e.g. "377620709.0", which TIDAL rejects when saving a playlist. Always coerce
 * to a string and strip any trailing ".0" so IDs round-trip cleanly.
 */
export function normalizeId(id: string | number): string {
  return String(id).trim().replace(/\.0+$/, '')
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
  migrateAddedColumns(_db)
  migrateFloatIds(_db)
  return _db
}

/**
 * One-time repair for libraries synced before IDs were normalised: strips the
 * trailing ".0" from track IDs across all tables. Runs inside a transaction
 * with foreign keys disabled so the parent/child IDs can be rewritten together.
 */
function migrateFloatIds(db: Database.Database) {
  const stale = db
    .prepare("SELECT COUNT(*) AS n FROM tracks WHERE id LIKE '%.0'")
    .get() as { n: number }
  if (stale.n === 0) return

  db.pragma('foreign_keys = OFF')
  db.transaction(() => {
    db.exec("UPDATE tracks SET id = substr(id, 1, length(id) - 2) WHERE id LIKE '%.0'")
    db.exec("UPDATE playlist_tracks SET track_id = substr(track_id, 1, length(track_id) - 2) WHERE track_id LIKE '%.0'")
    db.exec("UPDATE favorites SET track_id = substr(track_id, 1, length(track_id) - 2) WHERE track_id LIKE '%.0'")
  })()
  db.pragma('foreign_keys = ON')
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
      music_key TEXT,
      key_scale TEXT,
      album_id TEXT,
      artist_id TEXT,
      copyright TEXT,
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
      added_at TEXT,
      added_rank INTEGER,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    -- TIDAL listening-history surfaces (HISTORY_* mixes). A track can appear in
    -- several rows (e.g. all-time + multiple monthly mixes); membership +
    -- multiplicity + month_index recency drive the local frecency score.
    -- month_index: 0 = most recent month; -1 = N/A (alltime/yearly).
    CREATE TABLE IF NOT EXISTS track_history (
      track_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      month_index INTEGER NOT NULL DEFAULT -1,
      in_mix_rank INTEGER,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (track_id, tier, month_index),
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

    CREATE TABLE IF NOT EXISTS track_features (
      track_id TEXT PRIMARY KEY,
      genre TEXT,
      subgenre TEXT,
      mood TEXT,
      energy REAL,
      valence REAL,
      danceability REAL,
      acousticness REAL,
      era TEXT,
      instrumental INTEGER,
      tags TEXT,
      model TEXT,
      enriched_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feedback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT NOT NULL,
      action TEXT NOT NULL,
      context TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm);
    CREATE INDEX IF NOT EXISTS idx_feedback_track ON feedback_events(track_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);
    CREATE INDEX IF NOT EXISTS idx_track_history_track ON track_history(track_id);
  `)
  // NOTE: idx_favorites_added_at is created in migrateAddedColumns, AFTER the
  // added_at column is ensured. Creating it here would throw "no such column:
  // added_at" on libraries synced before that column existed, aborting init.
}

/**
 * Add columns introduced after a library was first synced. CREATE TABLE IF NOT
 * EXISTS won't alter an existing `favorites` table, so add the recency columns
 * idempotently. (track_history is new, so its CREATE handles older DBs already.)
 */
function migrateAddedColumns(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(favorites)").all() as Array<{ name: string }>
  const have = new Set(cols.map((c) => c.name))
  if (!have.has('added_at')) db.exec('ALTER TABLE favorites ADD COLUMN added_at TEXT')
  if (!have.has('added_rank')) db.exec('ALTER TABLE favorites ADD COLUMN added_rank INTEGER')
  // Safe now that added_at is guaranteed to exist (see initSchema note).
  db.exec('CREATE INDEX IF NOT EXISTS idx_favorites_added_at ON favorites(added_at)')

  const tcols = db.prepare("PRAGMA table_info(tracks)").all() as Array<{ name: string }>
  const thave = new Set(tcols.map((c) => c.name))
  if (!thave.has('music_key')) db.exec('ALTER TABLE tracks ADD COLUMN music_key TEXT')
  if (!thave.has('key_scale')) db.exec('ALTER TABLE tracks ADD COLUMN key_scale TEXT')
  // Extended metadata from the ibeal backend (cover art + relational IDs). These
  // back richer UI (album art) and future artist/album-graph features.
  if (!thave.has('album_id')) db.exec('ALTER TABLE tracks ADD COLUMN album_id TEXT')
  if (!thave.has('artist_id')) db.exec('ALTER TABLE tracks ADD COLUMN artist_id TEXT')
  if (!thave.has('copyright')) db.exec('ALTER TABLE tracks ADD COLUMN copyright TEXT')
}

export function upsertTrack(track: {
  id: string; title: string; artist: string; album?: string | null;
  duration?: number | null; bpm?: number | null; cover_url?: string | null;
  tidal_url?: string | null; isrc?: string | null; popularity?: number | null;
  explicit?: boolean | null; audio_quality?: string | null; release_date?: string | null;
  music_key?: string | null; key_scale?: string | null;
  album_id?: string | null; artist_id?: string | null; copyright?: string | null
}): 'inserted' | 'updated' {
  const db = getDb()
  const id = normalizeId(track.id)
  const existing = db.prepare('SELECT id FROM tracks WHERE id = ?').get(id)
  db.prepare(`
    INSERT OR REPLACE INTO tracks
      (id, title, artist, album, duration, bpm, cover_url, tidal_url, isrc, popularity, explicit, audio_quality, release_date, music_key, key_scale, album_id, artist_id, copyright, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id, track.title, track.artist,
    track.album ?? null, track.duration ?? null, track.bpm ?? null,
    track.cover_url ?? null, track.tidal_url ?? null,
    track.isrc ?? null, track.popularity ?? null,
    track.explicit ? 1 : 0,
    track.audio_quality ?? null, track.release_date ?? null,
    track.music_key ?? null, track.key_scale ?? null,
    track.album_id ?? null, track.artist_id ?? null, track.copyright ?? null
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
    for (const t of tracks) insert.run(playlistId, normalizeId(t.id), t.position)
  })
  insertBatch()
}

/**
 * Replace the favourites set. Accepts either bare IDs (legacy) or rows carrying
 * the real `added_at` timestamp and date-descending `rank` (0 = most recently
 * added) so the recommender can bias toward recently-saved tracks.
 */
export function setFavorites(
  favorites: Array<string | { id: string; added_at?: string | null; rank?: number | null }>
): void {
  const db = getDb()
  const insertFav = db.prepare(
    "INSERT OR REPLACE INTO favorites (track_id, added_at, added_rank, synced_at) VALUES (?, ?, ?, datetime('now'))"
  )
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM favorites').run()
    favorites.forEach((f, i) => {
      if (typeof f === 'string') {
        insertFav.run(normalizeId(f), null, i)
      } else {
        insertFav.run(normalizeId(f.id), f.added_at ?? null, f.rank ?? i)
      }
    })
  })
  replace()
}

export interface TrackHistoryRow {
  trackId: string
  tier: 'alltime' | 'monthly' | 'yearly' | 'recently_played'
  monthIndex?: number | null
  rank?: number | null
}

/**
 * Replace the listening-history rows wholesale. History mixes are rolling
 * (monthly mixes rotate, tracks drop out), so each sync clears and rebuilds.
 */
export function replaceTrackHistory(rows: TrackHistoryRow[]): void {
  const db = getDb()
  const insert = db.prepare(
    "INSERT OR REPLACE INTO track_history (track_id, tier, month_index, in_mix_rank, synced_at) VALUES (?, ?, ?, ?, datetime('now'))"
  )
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM track_history').run()
    for (const r of rows) {
      insert.run(normalizeId(r.trackId), r.tier, r.monthIndex ?? -1, r.rank ?? null)
    }
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

export interface RecommenderRow extends LibraryTrack {
  added_at: string | null
  added_rank: number | null
  in_alltime: number
  in_yearly: number
  /** Comma-separated month_index list for the monthly history mixes this track is in. */
  monthly_months: string | null
  /** Best (lowest) position the track holds across any history mix. */
  best_mix_rank: number | null
}

export interface CandidateFilter {
  /** BPM windows (inclusive) to union; omit for the whole library. */
  bpmRanges?: Array<[number, number]>
  favoritesOnly?: boolean
}

/**
 * Build the candidate pool for the local recommender, joining every scoring
 * signal in one pass: favourite add-recency, and aggregated listening-history
 * membership (all-time / yearly / which monthly mixes + best rank).
 */
export function getRecommenderPool(filter: CandidateFilter = {}): RecommenderRow[] {
  const where: string[] = []
  const params: Array<number> = []

  if (filter.bpmRanges && filter.bpmRanges.length > 0) {
    const ors = filter.bpmRanges.map(([lo, hi]) => {
      params.push(lo, hi)
      return 't.bpm BETWEEN ? AND ?'
    })
    where.push(`(${ors.join(' OR ')})`)
  }
  if (filter.favoritesOnly) where.push('f.track_id IS NOT NULL')

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  return getDb()
    .prepare(
      `
      SELECT
        t.*,
        f.added_at AS added_at,
        f.added_rank AS added_rank,
        CASE WHEN f.track_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite,
        MAX(CASE WHEN h.tier = 'alltime' THEN 1 ELSE 0 END) AS in_alltime,
        MAX(CASE WHEN h.tier = 'yearly'  THEN 1 ELSE 0 END) AS in_yearly,
        GROUP_CONCAT(CASE WHEN h.tier = 'monthly' THEN h.month_index END) AS monthly_months,
        MIN(h.in_mix_rank) AS best_mix_rank
      FROM tracks t
      LEFT JOIN favorites f ON f.track_id = t.id
      LEFT JOIN track_history h ON h.track_id = t.id
      ${whereSql}
      GROUP BY t.id
      `
    )
    .all(...params) as RecommenderRow[]
}

/**
 * Log accept/reject feedback so future iterations can learn weights / a local
 * ranker (Phase 5). Lightweight append-only event log.
 */
export function logFeedback(
  events: Array<{ track_id: string; action: 'accept' | 'reject'; context?: string | null }>
): void {
  if (events.length === 0) return
  const db = getDb()
  const ins = db.prepare(
    'INSERT INTO feedback_events (track_id, action, context) VALUES (?, ?, ?)'
  )
  db.transaction(() => {
    for (const e of events) ins.run(normalizeId(e.track_id), e.action, e.context ?? null)
  })()
}

/** Per-track accept/reject tallies (foundation for learned re-ranking). */
export function getFeedbackTallies(): Map<string, { accepts: number; rejects: number }> {
  const rows = getDb()
    .prepare(
      `SELECT track_id,
         SUM(CASE WHEN action='accept' THEN 1 ELSE 0 END) AS accepts,
         SUM(CASE WHEN action='reject' THEN 1 ELSE 0 END) AS rejects
       FROM feedback_events GROUP BY track_id`
    )
    .all() as Array<{ track_id: string; accepts: number; rejects: number }>
  return new Map(rows.map((r) => [r.track_id, { accepts: r.accepts, rejects: r.rejects }]))
}

/** Fetch full library rows for a set of track IDs (order not guaranteed). */
export function getTracksByIds(ids: string[]): LibraryTrack[] {
  if (ids.length === 0) return []
  const clean = ids.map((id) => normalizeId(id))
  const placeholders = clean.map(() => '?').join(',')
  return getDb()
    .prepare(
      `SELECT t.*, CASE WHEN f.track_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
       FROM tracks t LEFT JOIN favorites f ON f.track_id = t.id
       WHERE t.id IN (${placeholders})`
    )
    .all(...clean) as LibraryTrack[]
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

export function startSyncLog(type: 'full' | 'incremental' | 'quick'): number {
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

export function updateTrackBpm(id: string, bpm: number): void {
  getDb().prepare('UPDATE tracks SET bpm = ? WHERE id = ?').run(Math.round(bpm), normalizeId(id))
}

export function getTracksWithoutBpm(): Array<{ id: string }> {
  return getDb()
    .prepare('SELECT id FROM tracks WHERE bpm IS NULL OR bpm = 0')
    .all() as Array<{ id: string }>
}

export function dbExists(): boolean {
  return fs.existsSync(DB_PATH)
}

export interface TrackFeatures {
  track_id: string
  genre: string | null
  subgenre: string | null
  mood: string | null
  energy: number | null
  valence: number | null
  danceability: number | null
  acousticness: number | null
  era: string | null
  instrumental: number | null
  tags: string | null
}

/** Library tracks that don't yet have LLM-derived features, for enrichment. */
export function getTracksWithoutFeatures(
  limit?: number
): Array<{ id: string; title: string; artist: string; album: string | null }> {
  const sql = `
    SELECT t.id, t.title, t.artist, t.album
    FROM tracks t
    LEFT JOIN track_features tf ON tf.track_id = t.id
    WHERE tf.track_id IS NULL
    ORDER BY t.synced_at DESC
    ${limit ? 'LIMIT ?' : ''}
  `
  const stmt = getDb().prepare(sql)
  return (limit ? stmt.all(limit) : stmt.all()) as Array<{
    id: string; title: string; artist: string; album: string | null
  }>
}

export function upsertTrackFeatures(f: TrackFeatures & { model?: string }): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO track_features
        (track_id, genre, subgenre, mood, energy, valence, danceability, acousticness, era, instrumental, tags, model, enriched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      normalizeId(f.track_id), f.genre ?? null, f.subgenre ?? null, f.mood ?? null,
      f.energy ?? null, f.valence ?? null, f.danceability ?? null, f.acousticness ?? null,
      f.era ?? null, f.instrumental ?? null, f.tags ?? null, f.model ?? null
    )
}

/** Map of track_id → genre (for sequencer style smoothing / run-capping). */
export function getGenreMap(): Map<string, string> {
  const rows = getDb()
    .prepare("SELECT track_id, genre FROM track_features WHERE genre IS NOT NULL")
    .all() as Array<{ track_id: string; genre: string }>
  return new Map(rows.map((r) => [r.track_id, r.genre]))
}

/** Map of track_id → audio-feature vector, for content-based similarity. */
export function getFeatureVectorMap(): Map<string, number[]> {
  const rows = getDb()
    .prepare(
      `SELECT track_id, energy, valence, danceability, acousticness, instrumental
       FROM track_features`
    )
    .all() as Array<{
    track_id: string; energy: number | null; valence: number | null
    danceability: number | null; acousticness: number | null; instrumental: number | null
  }>
  const map = new Map<string, number[]>()
  const num = (x: number | null) => (x == null ? 0.5 : Math.max(0, Math.min(1, x)))
  for (const r of rows) {
    if (r.energy == null && r.valence == null && r.danceability == null && r.acousticness == null) continue
    map.set(r.track_id, [
      num(r.energy), num(r.valence), num(r.danceability), num(r.acousticness),
      r.instrumental == null ? 0.5 : r.instrumental ? 1 : 0,
    ])
  }
  return map
}

export function getFeaturesCount(): { enriched: number; total: number } {
  const db = getDb()
  const enriched = (db.prepare('SELECT COUNT(*) n FROM track_features').get() as { n: number }).n
  const total = (db.prepare('SELECT COUNT(*) n FROM tracks').get() as { n: number }).n
  return { enriched, total }
}
