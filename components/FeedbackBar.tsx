'use client'

import { useState, useRef } from 'react'

interface Props {
  onSend: (text: string) => void
  onRegenerate: () => void
  isGenerating: boolean
  hasPlaylist: boolean
  canGenerate?: boolean
}

export default function FeedbackBar({ onSend, onRegenerate, isGenerating, hasPlaylist, canGenerate }: Props) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit() {
    if (isGenerating) return
    const trimmed = text.trim()
    if (!trimmed && !canGenerate) return
    onSend(trimmed)
    setText('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex gap-2 items-end">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          hasPlaylist
            ? 'Give feedback or ask for changes… (e.g. "more upbeat", "less hip-hop", "add some 80s classics")'
            : 'Optional: describe the vibe (e.g. "late night study session", "summer road trip")…'
        }
        rows={2}
        className="flex-1 resize-none rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/40 backdrop-blur focus:border-fuchsia-400/60 focus:outline-none"
        disabled={isGenerating}
      />
      <div className="flex flex-col gap-1.5">
        {hasPlaylist && !isGenerating && (
          <button
            onClick={onRegenerate}
            className="rounded-xl border border-white/12 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Regenerate
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={isGenerating || (!text.trim() && !canGenerate)}
          className="rounded-xl px-4 py-2 text-sm font-bold text-[#10031f] transition-transform enabled:hover:scale-[1.03] disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#f0abfc,#a5f3fc)' }}
        >
          {isGenerating ? '…' : hasPlaylist ? 'Send' : 'Generate'}
        </button>
      </div>
    </div>
  )
}
