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
        className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-teal-500 focus:outline-none"
        disabled={isGenerating}
      />
      <div className="flex flex-col gap-1.5">
        {hasPlaylist && !isGenerating && (
          <button
            onClick={onRegenerate}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Regenerate
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={isGenerating || (!text.trim() && !canGenerate)}
          className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-40 transition-colors"
        >
          {isGenerating ? '…' : hasPlaylist ? 'Send' : 'Generate'}
        </button>
      </div>
    </div>
  )
}
