'use client'

import { useMemo, useState } from 'react'
import Knob from './Knob'
import Fader from './Fader'
import type { RunConfig } from '@/types'

const PRESETS = [
  { label: '1K', km: 1 },
  { label: '5K', km: 5 },
  { label: '10K', km: 10 },
  { label: '½ Mar', km: 21.0975 },
  { label: 'Marathon', km: 42.195 },
]

function paceToTargetBpm(paceMinPerKm: number): number {
  const speedKmh = 60 / paceMinPerKm
  const bpm = Math.round(4.5 * speedKmh + 124)
  return Math.max(150, Math.min(200, bpm))
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  onGenerate: (config: RunConfig) => void
}

export default function RunnerConfig({ onGenerate }: Props) {
  const [mode, setMode] = useState<'pace' | 'bpm'>('pace')
  const [distanceKm, setDistanceKm] = useState(5)
  const [paceSec, setPaceSec] = useState(300) // sec / km
  const [bpm, setBpm] = useState(160)
  const [durationMin, setDurationMin] = useState(45)
  const [tolerance, setTolerance] = useState(8)

  const targetBpm = useMemo(
    () => (mode === 'pace' ? paceToTargetBpm(paceSec / 60) : bpm),
    [mode, paceSec, bpm]
  )
  const totalDurationSec = useMemo(
    () => (mode === 'pace' ? Math.round(distanceKm * paceSec) : durationMin * 60),
    [mode, distanceKm, paceSec, durationMin]
  )
  const bufferedDurationSec = Math.round(totalDurationSec * 1.15)
  const windows = useMemo(
    () => ({ half: Math.round(targetBpm / 2), twoThirds: Math.round((targetBpm * 2) / 3), full: targetBpm }),
    [targetBpm]
  )

  const configLabel = useMemo(() => {
    if (mode === 'pace') {
      const d = distanceKm >= 1 ? `${distanceKm.toFixed(distanceKm % 1 ? 1 : 0)} km` : `${(distanceKm * 1000).toFixed(0)} m`
      return `${d} at ${fmtPace(paceSec)}/km (${targetBpm} BPM)`
    }
    return `${fmtDuration(totalDurationSec)} run at ${targetBpm} BPM`
  }, [mode, distanceKm, paceSec, targetBpm, totalDurationSec])

  const isValid = totalDurationSec > 0 && targetBpm > 0

  function handleGenerate() {
    if (!isValid) return
    onGenerate({ targetBpm, bpmTolerance: tolerance, targetDurationSec: bufferedDurationSec, label: configLabel })
  }

  const activePreset = PRESETS.findIndex((p) => Math.abs(p.km - distanceKm) < 0.01)

  return (
    <div className="glass overflow-hidden rounded-3xl p-5 sm:p-6" style={{ animation: 'springIn 0.4s ease both' }}>
      {/* Header + cadence badge */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight gradient-text">Run Sequencer</h2>
          <p className="mt-1 text-xs text-white/60">Dial in your run — music locks to your cadence</p>
        </div>
        <div className="shrink-0 rounded-2xl border border-white/18 px-4 py-2 text-center"
          style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.25), rgba(168,85,247,0.25))' }}>
          <div className="gradient-text text-3xl font-black leading-none" style={{ backgroundImage: 'linear-gradient(90deg,#7dd3fc,#f0abfc)' }}>{targetBpm}</div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-white/60">cadence bpm</div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mb-5 inline-flex gap-1.5 rounded-2xl border border-white/12 bg-white/5 p-1.5">
        {(['pace', 'bpm'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="rounded-xl px-5 py-2 text-sm font-semibold transition-all"
            style={mode === m
              ? { background: 'linear-gradient(135deg,#38bdf8,#a855f7)', color: '#fff', boxShadow: '0 8px 20px -6px rgba(168,85,247,0.6)' }
              : { color: 'rgba(255,255,255,0.65)' }}
          >
            {m === 'pace' ? 'By Pace' : 'By BPM'}
          </button>
        ))}
      </div>

      {mode === 'pace' ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Fader
              label="distance" display={`${distanceKm.toFixed(distanceKm % 1 ? 1 : 0)} km`}
              value={distanceKm} min={0.5} max={42.2} step={0.1}
              onChange={setDistanceKm} from="#f472b6" to="#a855f7"
              ticks={['0', '21', '42 km']}
            />
            <Fader
              label="pace" display={`${fmtPace(paceSec)} /km`}
              value={paceSec} min={180} max={480} step={5}
              onChange={setPaceSec} from="#34d399" to="#38bdf8"
              ticks={['3:00', '5:30', '8:00']}
            />
            <Knob
              label="tolerance" display={`±${tolerance}`}
              value={tolerance} min={4} max={15} step={1}
              onChange={setTolerance} from="#fbbf24" to="#f472b6"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setDistanceKm(p.km)}
                className="rounded-xl border px-3.5 py-2 text-xs font-bold transition-all"
                style={activePreset === i
                  ? { background: 'linear-gradient(135deg,#f0abfc,#a5f3fc)', color: '#1a0a2e', borderColor: 'transparent', boxShadow: '0 8px 20px -6px rgba(165,243,252,0.5)' }
                  : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.14)' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mb-1 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_auto]">
          <Knob
            label="cadence" display={`${bpm}`}
            value={bpm} min={120} max={200} step={1}
            onChange={setBpm} from="#38bdf8" to="#a855f7"
          />
          <Fader
            label="run duration" display={fmtDuration(durationMin * 60)}
            value={durationMin} min={10} max={180} step={5}
            onChange={setDurationMin} from="#f472b6" to="#fbbf24"
            ticks={['10m', '90m', '3h']}
          />
          <Knob
            label="tolerance" display={`±${tolerance}`}
            value={tolerance} min={4} max={15} step={1}
            onChange={setTolerance} from="#fbbf24" to="#f472b6"
          />
        </div>
      )}

      {/* Readout */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/80">
        <span className="text-white/55">▸ </span>
        <span className="font-semibold text-white">{configLabel}</span>
        <span className="text-white/55"> · playlist ~{fmtDuration(bufferedDurationSec)} · windows {windows.half}½ · {windows.twoThirds}⅔ · {windows.full}</span>
      </div>

      {/* Generate */}
      <button
        onClick={handleGenerate}
        disabled={!isValid}
        className="mt-4 w-full rounded-2xl py-4 text-sm font-extrabold text-[#10031f] transition-transform enabled:hover:scale-[1.01] enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg,#f0abfc,#a5f3fc 55%,#7dd3fc)', boxShadow: '0 14px 34px -8px rgba(165,243,252,0.55)' }}
      >
        ▶ Generate run playlist
      </button>
    </div>
  )
}
