'use client'

interface Props {
  phase: string
}

const PHASES = [
  { id: 'favorites', label: 'Reading your music taste' },
  { id: 'playlists', label: 'Scanning your library' },
  { id: 'discovering', label: 'Exploring the music universe' },
  { id: 'curating', label: 'Crafting your playlist' },
]

function Equalizer() {
  const delays = [0, 0.15, 0.3, 0.1, 0.25, 0.05, 0.2]
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 28 }}>
      {delays.map((d, i) => (
        <div
          key={i}
          className="w-[5px] rounded-sm"
          style={{
            height: '100%',
            transformOrigin: 'bottom',
            background: 'linear-gradient(180deg, #a5f3fc, #f0abfc)',
            animation: `eq 0.85s ease-in-out ${d}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

export default function GeneratingView({ phase }: Props) {
  const currentIdx = PHASES.findIndex((p) => p.id === phase)

  const messages: Record<string, string> = {
    favorites: 'Tuning into your musical taste…',
    playlists: 'Checking what you already have…',
    discovering: 'Exploring the music universe…',
    curating: 'Handpicking tracks just for you…',
  }

  const message = messages[phase] ?? 'Finding your perfect tracks…'

  return (
    <div className="glass overflow-hidden rounded-2xl" style={{ animation: 'springIn 0.35s ease both' }}>
      {/* Animated header */}
      <div className="flex items-center gap-4 p-5">
        <Equalizer />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{message}</p>
          <p className="text-xs text-white/50 mt-0.5">Usually takes 10–20 seconds</p>
        </div>
      </div>

      {/* Phase stepper */}
      <div className="border-t border-white/10 px-5 py-3 flex flex-col gap-2">
        {PHASES.map((p, i) => {
          const isDone = currentIdx > i
          const isCurrent = currentIdx === i
          return (
            <div key={p.id} className="flex items-center gap-3">
              <div
                className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all duration-300 ${
                  isDone
                    ? 'bg-emerald-500 text-emerald-950'
                    : isCurrent
                    ? 'border border-fuchsia-400 bg-fuchsia-400/20 text-fuchsia-200'
                    : 'bg-white/8 text-white/40'
                }`}
              >
                {isDone ? '✓' : isCurrent ? (
                  <span className="h-2 w-2 rounded-full bg-fuchsia-300 animate-pulse" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                )}
              </div>
              <span
                className={`text-xs transition-colors duration-300 ${
                  isDone ? 'text-white/50' : isCurrent ? 'text-white font-medium' : 'text-white/40'
                }`}
              >
                {p.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
