'use client'

import type { Mood } from '@/types'

interface MoodItem {
  id: Mood
  label: string
  icon: string
  color: string
  angleDeg: number
}

const MOODS: MoodItem[] = [
  { id: 'romance',   label: 'Romance',   icon: '♡', color: '#f472b6', angleDeg: 0   },
  { id: 'energetic', label: 'Energetic', icon: '⚡', color: '#fb923c', angleDeg: 60  },
  { id: 'chill',     label: 'Chill',     icon: '🌴', color: '#34d399', angleDeg: 120 },
  { id: 'melancholy',label: 'Melancholy',icon: '◉', color: '#a78bfa', angleDeg: 180 },
  { id: 'focus',     label: 'Focus',     icon: '◎', color: '#38bdf8', angleDeg: 240 },
  { id: 'party',     label: 'Party',     icon: '✦', color: '#fbbf24', angleDeg: 300 },
]

const SIZE = 320
const CENTER = SIZE / 2
const RADIUS = 112

interface Props {
  selected: Mood | null
  onSelect: (mood: Mood | null) => void
}

export default function MoodSelector({ selected, onSelect }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-zinc-400 tracking-wide">Pick a mood</p>

      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {/* Outer gradient ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from -90deg, #f472b6, #fb923c, #34d399, #a78bfa, #38bdf8, #fbbf24, #f472b6)',
            opacity: 0.9,
          }}
        />

        {/* Slightly smaller mask to create ring effect */}
        <div
          className="absolute rounded-full bg-zinc-950"
          style={{ inset: '12%' }}
        />

        {/* Inner dark circle (center) */}
        <div
          className="absolute rounded-full bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center gap-1"
          style={{ inset: '30%' }}
        >
          <span className="text-xl select-none">🌊</span>
          {selected && (
            <span
              className="text-[9px] font-semibold uppercase tracking-widest"
              style={{ color: MOODS.find((m) => m.id === selected)?.color }}
            >
              {selected}
            </span>
          )}
        </div>

        {/* Mood items around the ring */}
        {MOODS.map((mood) => {
          const rad = (mood.angleDeg - 90) * (Math.PI / 180)
          const x = CENTER + RADIUS * Math.cos(rad)
          const y = CENTER + RADIUS * Math.sin(rad)
          const isSelected = selected === mood.id

          return (
            <button
              key={mood.id}
              onClick={() => onSelect(isSelected ? null : mood.id)}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
              }}
              className="flex flex-col items-center gap-0.5 group transition-transform duration-150 hover:scale-110 active:scale-95"
              title={mood.label}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-lg transition-all duration-200"
                style={{
                  background: isSelected ? mood.color : 'rgba(0,0,0,0.6)',
                  boxShadow: isSelected ? `0 0 16px ${mood.color}90` : 'none',
                  border: `2px solid ${isSelected ? mood.color : 'rgba(255,255,255,0.18)'}`,
                }}
              >
                {mood.icon}
              </div>
              <span
                className="text-[10px] font-semibold leading-tight tracking-wide"
                style={{
                  color: isSelected ? mood.color : 'rgba(255,255,255,0.65)',
                  textShadow: isSelected ? `0 0 8px ${mood.color}80` : 'none',
                }}
              >
                {mood.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
