# Tsunami BPM sidecar

A small local service that computes **BPM** for tracks TIDAL has no native `bpm`
for, using `ffmpeg` + `librosa`. It runs alongside Tsunami's other dev processes
(`npm run dev` starts it automatically) and is **only** hit during `full` /
`incremental` library syncs.

## Why it's a separate service

BPM analysis used to live inside [`tidal-mcp`](https://github.com/ibeal/tidal-mcp),
but that project is a deliberately thin shim over the TIDAL API and shouldn't
carry a heavy audio-DSP stack (librosa pulls numpy/scipy/numba/soundfile and
needs a system `ffmpeg`). TIDAL already ships a native `bpm` for many tracks —
this sidecar just fills the gaps — so the analysis is owned by Tsunami and kept
out of the MCP. See `bpm_service.py` for details.

## Requirements

- [`uv`](https://docs.astral.sh/uv/) (used to run the service)
- `ffmpeg` on your `PATH`

## Running

```bash
# From the repo root — started automatically by `npm run dev`:
npm run bpm

# Or directly:
cd bpm-service && BPM_SERVICE_PORT=5101 uv run python bpm_service.py
```

It reuses the TIDAL OAuth session that the main `tidal-mcp` Flask sidecar
persists (a shared temp file), so **log in through the main app first** — no
separate auth here.

## API

`POST /api/bpm/batch` — body `{ "track_ids": ["123", ...] }`. Streams Server-Sent
Events: one per track (`{track_id, bpm, status, processed, total}`) then a final
`{done: true, analyzed, failed, total}`. Consumed by `enrichBpmBatch` in
[`lib/tidal.ts`](../lib/tidal.ts).

`GET /health` — `{status, authenticated}`.

## Config

- `BPM_SERVICE_PORT` — port to listen on (default `5101`).
- The Next.js app points at it via `BPM_SERVICE_URL` (default `http://127.0.0.1:5101`).
