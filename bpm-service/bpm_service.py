"""Local BPM-analysis sidecar for Tsunami (ffmpeg + librosa).

WHY THIS LIVES HERE, NOT IN tidal-mcp
-------------------------------------
tidal-mcp is intentionally a thin shim over the TIDAL API and shouldn't carry a
heavy audio-DSP stack (librosa pulls numpy/scipy/numba/soundfile and needs a
system ffmpeg). TIDAL already ships a native `bpm` for many tracks (surfaced by
the MCP's track metadata); this sidecar only fills the *gaps* — tracks TIDAL has
no BPM for — by analysing a short audio segment locally. So the analysis is owned
by Tsunami and runs as its own process, keeping the MCP lean.

It reuses the TIDAL OAuth session that the tidal-mcp Flask app persists to a
shared temp file, so no separate login is needed — whichever process the user
logged in through writes the creds, and this one reads them to resolve each
track's stream URL.
"""
import os
import json
import tempfile
from pathlib import Path

import tidalapi
from flask import Flask, request, Response, stream_with_context

from bpm_utils import analyze_track_bpm

# Shared with the tidal-mcp Flask sidecar (see tidal_api/app.py: same temp path).
SESSION_FILE = Path(os.path.join(tempfile.gettempdir(), 'tidal-session-oauth.json'))

app = Flask(__name__)


def _load_session():
    """Load the persisted TIDAL session. Returns None if absent or expired."""
    if not SESSION_FILE.exists():
        return None
    session = tidalapi.Session()
    try:
        session.load_session_from_file(SESSION_FILE)
    except Exception:
        return None
    return session if session.check_login() else None


def stream_bpm_batch(session, track_ids):
    """Yield SSE 'data:' lines for each track's BPM analysis.

    Per-track event:
        {"track_id","bpm","status","processed","total"}
          status "ok":      a usable BPM was computed (bpm is a number)
          status "no_beat": audio analysed but no reliable tempo found (bpm null)
          status "error":   the track could not be analysed (bpm null, "error" set)
    Final event:
        {"done": true, "analyzed", "failed", "total"}
          analyzed = tracks with a usable BPM; failed = no_beat + error

    `processed` is the running count of tracks handled (ok + no_beat + error);
    the final event's `analyzed` is successes only — kept as distinct keys so a
    single field never means two different things.
    """
    total = len(track_ids)
    analyzed = 0
    failed = 0
    processed = 0

    for tid in track_ids:
        processed += 1
        try:
            track = session.track(int(float(tid)))
            url = track.get_url()
            bpm = analyze_track_bpm(url)
            if bpm is not None:
                analyzed += 1
                yield f"data: {json.dumps({'track_id': tid, 'bpm': bpm, 'status': 'ok', 'processed': processed, 'total': total})}\n\n"
            else:
                failed += 1
                yield f"data: {json.dumps({'track_id': tid, 'bpm': None, 'status': 'no_beat', 'processed': processed, 'total': total})}\n\n"
        except Exception as e:
            failed += 1
            yield f"data: {json.dumps({'track_id': tid, 'bpm': None, 'status': 'error', 'error': str(e), 'processed': processed, 'total': total})}\n\n"

    yield f"data: {json.dumps({'done': True, 'analyzed': analyzed, 'failed': failed, 'total': total})}\n\n"


@app.route('/api/bpm/batch', methods=['POST'])
def bpm_batch():
    """Stream BPM analysis for a list of track IDs over Server-Sent Events.

    Request body: { "track_ids": ["123", "456", ...] }
    """
    session = _load_session()
    if session is None:
        return {"error": "Not authenticated with TIDAL. Log in via the main app first."}, 401

    data = request.get_json() or {}
    track_ids = data.get('track_ids', [])

    return Response(
        stream_with_context(stream_bpm_batch(session, track_ids)),
        content_type='text/event-stream',
        headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache'},
    )


@app.route('/health', methods=['GET'])
def health():
    """Liveness + whether a usable TIDAL session is available."""
    return {"status": "ok", "authenticated": _load_session() is not None}


if __name__ == '__main__':
    port = int(os.environ.get('BPM_SERVICE_PORT', 5101))
    print(f"Tsunami BPM sidecar starting on port {port}")
    app.run(host='127.0.0.1', port=port, threaded=True)
