'use client'

import { useState } from 'react'

interface Props {
  onConnected: () => void
}

export default function ConnectTidal({ onConnected }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleConnect() {
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/tidal/login', { method: 'POST' })
      const data = await res.json()
      if (data.status === 'success') {
        onConnected()
      } else {
        setError(data.message ?? 'Login failed')
        setStatus('error')
      }
    } catch (e) {
      setError(String(e))
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="text-5xl">🎵</div>
      <h2 className="text-xl font-semibold text-white">Connect your TIDAL account</h2>
      <p className="max-w-sm text-sm text-zinc-400">
        A browser window will open for you to log in. This only needs to happen once — your session is saved locally.
      </p>
      <button
        onClick={handleConnect}
        disabled={status === 'loading'}
        className="rounded-lg bg-teal-600 px-6 py-2.5 font-medium text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? 'Opening browser…' : 'Connect TIDAL'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
