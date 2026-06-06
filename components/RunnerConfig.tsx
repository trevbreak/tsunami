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
    <div className="flex flex-col gap-5">
      {/* Mode toggle */}
      <div className="flex rounded-xl border border-zinc-800 bg-zinc-900/40 p-1 gap-1">
        {(['pace', 'bpm'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setInputMode(m)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
              inputMode === m
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
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
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                    selectedPreset === i
                      ? 'bg-teal-500/20 border border-teal-500/60 text-teal-400'
                      : 'border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setSelectedPreset(null)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                  selectedPreset === null && customDistanceStr
                    ? 'bg-teal-500/20 border border-teal-500/60 text-teal-400'
                    : 'border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                }`}
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

      {/* Summary */}
      {isValid && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-zinc-300">{configLabel}</span>
              <span className="text-xs text-zinc-500">
                Playlist: ~{formatDuration(bufferedDurationSec!)} (with 15% buffer)
              </span>
              {compatibleBpms && (
                <span className="text-xs text-zinc-600 mt-0.5">
                  Music targets: {compatibleBpms.half} BPM (÷2) · {compatibleBpms.twoThirds} BPM (⅔) · {compatibleBpms.full} BPM
                </span>
              )}
            </div>
            <div className="shrink-0 rounded-lg bg-teal-500/10 border border-teal-500/30 px-3 py-1.5 text-center">
              <div className="text-lg font-bold text-teal-400 leading-none">{targetBpm}</div>
              <div className="text-[10px] text-teal-500/70 uppercase tracking-wider mt-0.5">cadence</div>
            </div>
          </div>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!isValid}
        className="w-full rounded-xl py-3 text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-500 text-white"
      >
        Generate Run Playlist
      </button>
    </div>
  )
}
