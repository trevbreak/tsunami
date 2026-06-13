# 🌊 Tsunami

**A Claude-powered playlist generator and curator for TIDAL.**

Tsunami pairs Anthropic's Claude with your TIDAL listening history to build playlists that actually expand your taste — not just rehash the songs you already love. Tell it a mood, set a running pace, or point it at an existing playlist, and it analyses your favorites, curates tracks to match, and lets you refine the result in real time.

---

## ✨ Features

*   **Create mode** — Pick a mood (romance, energetic, chill, melancholy, focus, party) and Claude generates a 15–20 track playlist seeded from your real TIDAL favorites.
*   **Enhance mode** — Point Tsunami at an existing TIDAL playlist. It analyses the playlist's "musical DNA" and suggests new tracks that fit naturally without duplicating what's already there.
*   **Run mode** — Enter a distance and pace (or a direct BPM target) and Tsunami calculates your running cadence, builds a playlist long enough to cover the whole run (with a 15% buffer), and fills it with tracks matched to that tempo from your library and recommendations.
*   **Discovery-first curation** — A deliberate prompt mandate ensures the majority of suggestions are _new_ discoveries and deeper cuts, not just the obvious hits by artists you already follow.
*   **Interactive feedback loop** — Accept or reject individual tracks. Rejecting a track automatically swaps in a fresh discovery. Type free-form feedback ("more upbeat", "less mainstream") to steer the next round.
*   **Reddit taste context** — Pulls trending posts from music subreddits (r/indieheads, r/hiphopheads, r/listentothis, and more) to give Claude a sense of what's resonating right now.
*   **Real-time streaming** — Curation progress and tracks stream into the UI live via Server-Sent Events.
*   **Save back to TIDAL** — Create a brand-new playlist from accepted tracks, or append them to the existing playlist you're enhancing.

---

## 🏗️ How it works

```
┌──────────────┐     SSE      ┌─────────────────────┐    HTTP    ┌──────────────────┐
│   Browser    │ ◀──────────▶ │  Next.js API routes │ ◀────────▶ │  TIDAL MCP server │
│  (React UI)  │              │  /api/generate      │            │  (tidal-mcp,      │
└──────────────┘              │  /api/enhance       │            │   local, :5100)   │
                              │  /api/run           │            └──────────────────┘
                              │  /api/save  ...     │
                              └─────────┬───────────┘
                                        │  Messages API + tool use
                                        ▼
                                 ┌──────────────┐
                                 │  Claude      │
                                 │ (Anthropic)  │
                                 └──────────────┘
```

1.  The React frontend (`app/page.tsx`) drives the flow and consumes a streaming response.
2.  Next.js API routes orchestrate a Claude tool-use loop. Claude is given tools to read your favorites, fetch recommendations, and inspect your existing playlists.
3.  Each tool call is proxied through `lib/tidal.ts` to a locally-running **TIDAL MCP** server, which talks to TIDAL on your behalf.
4.  Claude returns a curated tracklist as a structured JSON block, which Tsunami enriches with cover art / URLs and streams back to the UI.
5.  Accepted tracks are written back to TIDAL through the same server.

---

## 🙏 Acknowledgements

Tsunami's TIDAL connectivity is built entirely on top of the excellent [**tidal-mcp**](https://github.com/yuhuacheng/tidal-mcp) project by [**yuhuacheng**](https://github.com/yuhuacheng).

tidal-mcp handles TIDAL authentication, favorites, recommendations, and playlist management, and exposes them over a local HTTP API. Tsunami would not be possible without it — huge thanks to the author for building and sharing it. Please go star their repo. 🌟

> Tsunami talks to tidal-mcp's HTTP REST API (`tidal_api/app.py`), which it runs as a local sidecar process.

---

## 📋 Prerequisites

*   **Node.js 18+** (and npm)
*   **Python** with [**uv**](https://github.com/astral-sh/uv) — required to run the tidal-mcp server
*   A local clone of [**tidal-mcp**](https://github.com/yuhuacheng/tidal-mcp)
*   An **Anthropic API key**
*   A **TIDAL account**

---

## 🚀 Getting started

### 1\. Clone the TIDAL MCP server

```
git clone https://github.com/yuhuacheng/tidal-mcp.git
```

Follow its README to install dependencies (it uses `uv`).

### 2\. Install Tsunami's dependencies

```
npm install
```

### 3\. Configure environment variables

Create a `.env.local` file in the project root:

```
# Required — your Anthropic API key
ANTHROPIC_API_KEY=sk-ant-...

# Optional — where the tidal-mcp HTTP server is reachable
# (defaults to http://127.0.0.1:5100)
TIDAL_API_URL=http://127.0.0.1:5100
```

### 4\. Point the dev script at your tidal-mcp clone

The tidal script in package.json launches the MCP server. By default it expects tidal-mcp to be cloned as a sibling directory next to this repo, with uv available on your PATH:

```
"tidal": "cd ../tidal-mcp && TIDAL_MCP_PORT=5100 uv run python tidal_api/app.py",
```

If your tidal-mcp clone lives elsewhere, or `uv` isn't on your `PATH`, edit this line to point at the right locations.

### 5\. Run everything

```
npm run dev
```

This uses `concurrently` to start both:

*   the **tidal-mcp** server on port `5100` (label: `tidal`, cyan)
*   the **Next.js** dev server on port `3000` (label: `next`, magenta)

Open [http://localhost:3000](http://localhost:3000).

### 6\. Connect TIDAL

On first launch you'll be prompted to connect TIDAL. A browser window opens for you to log in; the session is saved locally by tidal-mcp, so you only need to do this once.

---

## 🧑‍💻 Usage

1.  **Create a playlist** — Select a mood from the wheel, optionally add a text instruction, and hit generate. Watch tracks stream in.
2.  **Refine** — Reject tracks you don't like (a replacement is fetched automatically), tweak the mood, or type feedback like _"more instrumental, fewer vocals"_.
3.  **Save** — Once you're happy, save the accepted tracks as a new TIDAL playlist.
4.  **Or enhance** — Switch to _Enhance Existing_, pick one of your TIDAL playlists, and Tsunami suggests additions tailored to that playlist's vibe. Accepted tracks are appended to the original.
5.  **Or run** — Switch to _Run_, choose a distance preset (1 km, 1 mi, 5 km, 10 km, half marathon, marathon, or custom) and enter your target pace in min/km or min/mile — or switch to _By BPM_ and set a cadence directly. Tsunami calculates the target BPM and playlist duration, then generates a tempo-matched playlist that fills your entire run. All tracks are accepted by default so you can save straight away.

---

## 🔁 Restarting & the local recommender

Tsunami syncs your TIDAL library into a local SQLite database (`data/library.db`) and ranks
playlists **locally** — biased toward tracks you've **added recently** and **play often** —
before Claude curates. A DJ-style **sequencer** then orders the final list (smooth tempo/key
transitions, artists spaced apart). Optional Claude **enrichment** (genre/mood) sharpens the
style-aware sequencing.

### Start it up

```bash
cd /path/to/tsunami        # the repo root
npm run dev                # starts tidal-mcp (:5100) + Next.js (:3000)
```

Wait for **both** lines to appear:

```
[tidal] Starting Flask app on port 5100
[next]  ✓ Ready ... Local: http://localhost:3000
```

> The `tidal` script in `package.json` points at an **absolute** path to your tidal-mcp clone
> (so it works from any checkout/worktree). Edit it if yours lives elsewhere.
> If **Connect TIDAL** fails with `fetch failed`, the tidal-mcp backend isn't on `:5100` —
> check the `[tidal]` logs.

### 1. Sync your library (streams progress over SSE)

```bash
# Quick — favourites + listening-history mixes only (seconds). Enough for recommendations.
curl -N -X POST http://localhost:3000/api/library/sync \
  -H 'Content-Type: application/json' -d '{"mode":"quick"}'

# Full — also crawls all your playlists (slower).
curl -N -X POST http://localhost:3000/api/library/sync \
  -H 'Content-Type: application/json' -d '{"mode":"full"}'
```

A sync also captures **BPM** and **musical key**, which the sequencer uses for harmonic mixing.

### 2. Enrich with genre/mood — optional, powered by Claude

```bash
curl -N -X POST http://localhost:3000/api/enrich   # labels genre/mood/energy/… (batched, streams)
curl -s        http://localhost:3000/api/enrich    # coverage: {"enriched":N,"total":M}
```

This unlocks **style-aware sequencing** (small genre clusters, gradual transitions).

### 3. Generate

* **In the app** — Create / Run / Enhance modes (now recency/frecency-biased and DJ-sequenced).
* **Locally, no LLM** (fast, for inspection/tuning):
  ```bash
  curl -s 'http://localhost:3000/api/recommend?explain=1&limit=25'
  ```
* **Weight-tuning harness** — open <http://localhost:3000/tuner.html>.

### How the recommender ranks (tuned)

Your **saved favourites are the spine**, tilted toward **recent adds**, with **listening-history
play** as reinforcement and a little novelty for variety; popularity is near-zero. The weights
live in `lib/recommender.ts` (`DEFAULT_WEIGHTS`) and **every weight is overridable** as a query
param on `/api/recommend` (e.g. `?recencyAdd=3&playMonthly=1.2&novelty=1.5&sequence=1`).

> **Heads-up:** the recommender needs a synced `data/library.db`. After a fresh clone or moving
> machines, run a sync (step 1) before generating, or `/api/recommend` returns `409`.

---

## 📜 Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run the tidal-mcp server and Next.js dev server together |
| `npm run tidal` | Run only the tidal-mcp server (edit the path first) |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |

---

## 🗂️ Project structure

```
app/
  page.tsx                 # Main client UI: mode switching, streaming, feedback loop
  api/
    generate/route.ts      # Create-mode: ranked pool → Claude curation → sequenced (SSE)
    enhance/route.ts       # Enhance-mode: suggest additions for a playlist (SSE)
    run/route.ts           # Run-mode: BPM-matched, recommender-ranked, sequenced (SSE)
    recommend/route.ts     # Local, LLM-free generation + weight A/B (GET)
    library/sync/route.ts  # Sync TIDAL → SQLite (quick | full | incremental) (SSE)
    enrich/route.ts        # LLM genre/mood enrichment over the library (SSE)
    tuning/route.ts        # Persistence for the weight-tuning harness
    save/route.ts          # Create a new TIDAL playlist
    tidal/                 # Auth, login, playlists, playlist tracks proxies
components/
  RunnerConfig.tsx         # Distance/pace/BPM input UI for Run mode
  ...                      # Mood selector, playlist views, track cards, feedback bar
lib/
  db.ts                    # SQLite layer: tracks, favourites, history, features, feedback
  sync.ts                  # TIDAL → SQLite sync (favourites recency + history frecency)
  recommender.ts           # Local weighted scorer (recency + frecency + ISRC merge)
  sequencer.ts             # DJ sequencing: Camelot key + tempo + artist spacing
  similarity.ts            # Content-based audio-feature distance
  enrich.ts                # Batched Claude classification → track_features
  claude.ts                # Anthropic client, tool defs, system prompts, parsing
  tidal.ts                 # Thin client over the tidal-mcp HTTP API
  reddit.ts                # Music-subreddit context fetching
public/tuner.html          # Standalone recommender weight-tuning harness
types/index.ts             # Shared TypeScript types (incl. RunConfig)
```

---

## 🛠️ Tech stack

*   [**Next.js 16**](https://nextjs.org/) (App Router) + **React 19**
*   [**Tailwind CSS 4**](https://tailwindcss.com/)
*   **TypeScript**
*   [**Anthropic SDK**](https://docs.anthropic.com/) — Claude with tool use (model: `claude-sonnet-4-6`)
*   [**tidal-mcp**](https://github.com/yuhuacheng/tidal-mcp) — TIDAL integration

---

## ⚠️ Notes

*   This is a personal/local project: the tidal-mcp server runs on your own machine and stores your TIDAL session locally.
*   The `tidal` npm script ships with machine-specific paths — be sure to edit it (see step 4) before running.