'use client'

import { useState, useMemo } from 'react'
import type { RunConfig } from '@/types'

const PRESETS = [
  { label: '1 km', km: 1 },
  { label: '1 mi', km: 1.60934 },
  { label: '5 km', km: 5 },
  { label: '10 km', km: 10 },
  { label: '½ Marathon', km: 21.0975 },
  { label: 'Marathon', km: 42.195 },
]

function paceToTargetBpm(paceMinPerKm: number): number {
  const speedKmh = 60 / paceMinPerKm
  const bpm = Math.round(4.5 * speedKmh + 124)
  return Math.max(150, Math.min(200, bpm))
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatPaceDisplay(paceMinPerKm: number, unit: 'km' | 'mile'): string {
  const pace = unit === 'mile' ? paceMinPerKm * 1.60934 : paceMinPerKm
  const m = Math.floor(pace)
  const s = Math.round((pace - m) * 60)
  return `${m}:${s.toString().padStart(2, '0')}/${unit}`
}

interface Props {
  onGenerate: (config: RunConfig) => void
}

export default function RunnerConfig({ onGenerate }: Props) {
  const [inputMode, setInputMode] = useState<'pace' | 'bpm'>('pace')

  // Pace mode
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [customDistanceStr, setCustomDistanceStr] = useState('')
  const [customDistanceUnit, setCustomDistanceUnit] = useState<'km' | 'mile'>('km')
  const [paceMin, setPaceMin] = useState('')
  const [paceSec, setPaceSec] = useState('')
  const [paceUnit, setPaceUnit] = useState<'km' | 'mile'>('km')

  // BPM mode
  const [directBpmStr, setDirectBpmStr] = useState('')
  const [durationHoursStr, setDurationHoursStr] = useState('')
  const [durationMinsStr, setDurationMinsStr] = useState('')

  const distanceKm = useMemo(() => {
    if (inputMode !== 'pace') return null
    if (selectedPreset !== null) return PRESETS[selectedPreset].km
    const val = parseFloat(customDistanceStr)
    if (!val || val <= 0) return null
    return customDistanceUnit === 'mile' ? val * 1.60934 : val
  }, [inputMode, selectedPreset, customDistanceStr, customDistanceUnit])

  const paceMinPerKm = useMemo(() => {
    if (inputMode !== 'pace') return null
    const mins = parseInt(paceMin) || 0
    const secs = parseInt(paceSec) || 0
    const total = mins + secs / 60
    if (total <= 0) return null
    return paceUnit === 'mile' ? total / 1.60934 : total
  }, [inputMode, paceMin, paceSec, paceUnit])

  const targetBpm = useMemo(() => {
    if (inputMode === 'bpm') {
      const val = parseInt(directBpmStr)
      return val >= 60 && val <= 220 ? val : null
    }
    return paceMinPerKm ? paceToTargetBpm(paceMinPerKm) : null
  }, [inputMode, directBpmStr, paceMinPerKm])

  const totalDurationSec = useMemo(() => {
    if (inputMode === 'pace') {
      if (!distanceKm || !paceMinPerKm) return null
      return Math.round(distanceKm * paceMinPerKm * 60)
    }
    const h = parseInt(durationHoursStr) || 0
    const m = parseInt(durationMinsStr) || 0
    const total = h * 3600 + m * 60
    return total > 0 ? total : null
  }, [inputMode, distanceKm, paceMinPerKm, durationHoursStr, durationMinsStr])

  const bufferedDurationSec = useMemo(
    () => (totalDurationSec ? Math.round(totalDurationSec * 1.15) : null),
    [totalDurationSec]
  )

  const compatibleBpms = useMemo(() => {
    if (!targetBpm) return null
    return {
      half: Math.round(targetBpm / 2),
      twoThirds: Math.round((targetBpm * 2) / 3),
      full: targetBpm,
    }
  }, [targetBpm])

  const isValid = !!targetBpm && !!totalDurationSec

  const distanceLabel = useMemo(() => {
    if (selectedPreset !== null) return PRESETS[selectedPreset].label
    if (customDistanceStr) return `${customDistanceStr} ${customDistanceUnit}`
    return ''
  }, [selectedPreset, customDistanceStr, customDistanceUnit])

  const configLabel = useMemo(() => {
    if (!isValid) return ''
    if (inputMode === 'pace' && paceMinPerKm) {
      return `${distanceLabel} at ${formatPaceDisplay(paceMinPerKm, paceUnit)} (${targetBpm} BPM)`
    }
    return `${formatDuration(totalDurationSec!)} run at ${targetBpm} BPM`
  }, [isValid, inputMode, distanceLabel, paceMinPerKm, paceUnit, targetBpm, totalDurationSec])

  function handleGenerate() {
    if (!isValid) return
    onGenerate({
      targetBpm: targetBpm!,
      bpmTolerance: 10,
      targetDurationSec: bufferedDurationSec!,
      label: configLabel,
    })
  }

  return (
    <div
      className="flex flex-col gap-5 rounded-2xl border border-zinc-700/70 p-4 sm:p-5"
      style={{
        background: 'linear-gradient(180deg, #2a2c33, #16171b)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 50px -24px #000',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      {/* Device header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[13px] uppercase tracking-[0.16em] text-zinc-300">
          <span className="rounded bg-[#ff5b00] px-1.5 py-0.5 text-[11px] font-bold tracking-[0.05em] text-[#1a1205]">TSUNAMI</span>
          run sequencer
        </div>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-zinc-200">
          <span className="h-2 w-2 rounded-full bg-[#ff5b00] shadow-[0_0_8px_#ff5b00]" /> run
        </span>
      </div>

      {/* CRT cadence screen */}
      <div
        className="rounded-xl border border-[#0a3a2a] px-4 py-3"
        style={{ background: 'repeating-linear-gradient(0deg, rgba(25,195,125,0.05) 0 2px, transparent 2px 4px), #0c1410', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.7)' }}
      >
        <div className="flex items-end justify-between">
          <span className="text-[12px] uppercase tracking-[0.12em] text-[#1a7a55]">
            {inputMode === 'pace' ? 'pace target' : 'cadence target'}
          </span>
          <div className="text-right leading-none text-[#ff5b00]">
            <div className="text-[10px] uppercase tracking-[0.12em]">cadence</div>
            <div className="text-3xl font-bold tabular-nums">{targetBpm ?? '—'}</div>
            <div className="text-[10px] uppercase tracking-[0.12em]">bpm</div>
          </div>
        </div>
        <div className="mt-2 border-t border-dashed border-[rgba(25,195,125,0.25)] pt-2 text-[12px] text-[#9fe9c9]">
          {isValid
            ? <>▸ {configLabel} · playlist ~{formatDuration(bufferedDurationSec!)}</>
            : <span className="text-[#3f7a64]">▸ set {inputMode === 'pace' ? 'distance + pace' : 'BPM + duration'} to arm…</span>}
        </div>
        {compatibleBpms && (
          <div className="mt-1 text-[11px] text-[#4f8a73]">
            music windows · {compatibleBpms.half}½ · {compatibleBpms.twoThirds}⅔ · {compatibleBpms.full} 1:1
          </div>
        )}
      </div>

      {/* Mode toggle — illuminated device buttons */}
      <div className="flex gap-2">
        {(['pace', 'bpm'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setInputMode(m)}
            className="flex-1 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition-all"
            style={
              inputMode === m
                ? { background: '#ff5b00', color: '#1a1205', boxShadow: '0 3px 0 #a23a00' }
                : { background: '#cbc9c2', color: '#1a1205', boxShadow: '0 3px 0 #8a8983' }
            }
          >
            {m === 'pace' ? 'By Pace' : 'By BPM'}
          </button>
        ))}
      </div>

      {inputMode === 'pace' ? (
        <>
          {/* Distance presets */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Distance</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => { setSelectedPreset(i); setCustomDistanceStr('') }}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-[0.04em] transition-all active:translate-y-0.5"
                  style={
                    selectedPreset === i
                      ? { background: '#ff5b00', color: '#1a1205', boxShadow: '0 3px 0 #a23a00' }
                      : { background: '#cbc9c2', color: '#1a1205', boxShadow: '0 3px 0 #8a8983' }
                  }
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setSelectedPreset(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-[0.04em] transition-all active:translate-y-0.5"
                style={
                  selectedPreset === null && customDistanceStr
                    ? { background: '#ff5b00', color: '#1a1205', boxShadow: '0 3px 0 #a23a00' }
                    : { background: '#2f6df6', color: '#fff', boxShadow: '0 3px 0 #1c45a8' }
                }
              >
                Custom
              </button>
            </div>
            {selectedPreset === null && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={customDistanceStr}
                  onChange={(e) => setCustomDistanceStr(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-teal-500/60 focus:outline-none"
                />
                <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
                  {(['km', 'mile'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setCustomDistanceUnit(u)}
                      className={`px-3 py-2 text-xs font-medium transition-colors ${
                        customDistanceUnit === u
                          ? 'bg-zinc-700 text-white'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pace input */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Pace</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={paceMin}
                onChange={(e) => setPaceMin(e.target.value)}
                placeholder="5"
                min="1"
                max="30"
                className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-sm text-white placeholder-zinc-600 focus:border-teal-500/60 focus:outline-none"
              />
              <span className="text-zinc-600 text-sm">:</span>
              <input
                type="number"
                value={paceSec}
                onChange={(e) => setPaceSec(e.target.value)}
                placeholder="00"
                min="0"
                max="59"
                className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-sm text-white placeholder-zinc-600 focus:border-teal-500/60 focus:outline-none"
              />
              <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
                {(['km', 'mile'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setPaceUnit(u)}
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      paceUnit === u
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    /{u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* BPM input */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Target BPM</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={directBpmStr}
                onChange={(e) => setDirectBpmStr(e.target.value)}
                placeholder="175"
                min="60"
                max="220"
                className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-teal-500/60 focus:outline-none"
              />
              <span className="text-xs text-zinc-600">BPM</span>
            </div>
          </div>

          {/* Duration input */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Run Duration</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={durationHoursStr}
                onChange={(e) => setDurationHoursStr(e.target.value)}
                placeholder="0"
                min="0"
                max="24"
                className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-sm text-white placeholder-zinc-600 focus:border-teal-500/60 focus:outline-none"
              />
              <span className="text-xs text-zinc-500">h</span>
              <input
                type="number"
                value={durationMinsStr}
                onChange={(e) => setDurationMinsStr(e.target.value)}
                placeholder="45"
                min="0"
                max="59"
                className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-sm text-white placeholder-zinc-600 focus:border-teal-500/60 focus:outline-none"
              />
              <span className="text-xs text-zinc-500">min</span>
            </div>
          </div>
        </>
      )}

      {/* Generate — chunky physical button */}
      <button
        onClick={handleGenerate}
        disabled={!isValid}
        className="w-full rounded-xl py-3.5 text-sm font-extrabold uppercase tracking-[0.08em] transition-all duration-150 disabled:cursor-not-allowed enabled:active:translate-y-0.5"
        style={
          isValid
            ? { background: 'linear-gradient(180deg, #ff7a2e, #ff5b00)', color: '#1a1205', boxShadow: '0 5px 0 #a23a00, 0 10px 24px -8px rgba(255,91,0,0.5)' }
            : { background: '#3a3c44', color: '#6b6d75', boxShadow: '0 4px 0 #25272d' }
        }
      >
        ▶ Generate run playlist
      </button>
    </div>
  )
}
