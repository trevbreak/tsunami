"""BPM analysis via ffmpeg + librosa. Called during library sync."""

import subprocess
import tempfile
import os
from typing import Optional


FFMPEG = 'ffmpeg'


def _run_ffmpeg(url: str, offset_sec: int, duration_sec: int, out_path: str) -> bool:
    """Download a segment of audio as a 22kHz mono WAV. Returns True on success."""
    result = subprocess.run(
        [
            FFMPEG, '-y',
            '-ss', str(offset_sec),
            '-t', str(duration_sec),
            '-i', url,
            '-ar', '22050',
            '-ac', '1',
            '-f', 'wav',
            out_path,
        ],
        capture_output=True,
        timeout=30,
    )
    return result.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 1000


def _detect_bpm(wav_path: str) -> Optional[float]:
    """Run librosa beat detection. Returns None if audio is too short or silent."""
    import librosa
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    if len(y) < sr * 4:  # less than 4s of actual audio — unreliable
        return None
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return float(tempo)


def _normalise_bpm(bpm: float) -> float:
    """
    Correct octave errors from librosa.
    librosa can return half or double the true BPM.
    Normalise into the musically sensible 60–200 BPM range.
    """
    while bpm > 0 and bpm < 60:
        bpm *= 2
    while bpm > 200:
        bpm /= 2
    return bpm


def analyze_track_bpm(url: str, offset_sec: int = 30, duration_sec: int = 30) -> Optional[float]:
    """
    Main entry point. Returns BPM (float) or None on failure.

    Strategy:
      1. Download 30s starting at offset 0:30 — skips intros, lands in the verse
      2. Normalise for octave errors
      3. If result still looks suspicious (< 70 BPM), try a second probe at offset 1:00
         and take the more musically plausible value
    """
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        wav_path = f.name

    try:
        # Primary probe: 0:30 → 1:00
        ok = _run_ffmpeg(url, offset_sec, duration_sec, wav_path)

        if not ok:
            # Fallback: try from the very start (e.g. very short tracks)
            ok = _run_ffmpeg(url, 0, duration_sec, wav_path)

        if not ok:
            return None

        bpm = _detect_bpm(wav_path)
        if bpm is None:
            return None

        bpm = _normalise_bpm(bpm)

        # If result is still suspiciously low, try a later segment
        if bpm < 70:
            ok2 = _run_ffmpeg(url, offset_sec + 30, duration_sec, wav_path)
            if ok2:
                bpm2 = _detect_bpm(wav_path)
                if bpm2 is not None:
                    bpm2 = _normalise_bpm(bpm2)
                    if 70 <= bpm2 <= 200:
                        bpm = bpm2

        if bpm < 40 or bpm > 220:
            return None  # Still nonsensical — give up

        return round(bpm, 1)

    except Exception:
        return None
    finally:
        try:
            os.unlink(wav_path)
        except OSError:
            pass
