import { useState, useEffect, useRef } from 'preact/hooks'
import { marked } from 'marked'

export function WikiQAModal({ isOpen, onClose }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const inputRef = useRef(null)

  // Focus input when opened; Escape to close
  useEffect(() => {
    if (!isOpen) return
    setTimeout(() => inputRef.current?.focus(), 50)
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  const reset = () => {
    setQuestion('')
    setAnswer(null)
    setError(null)
    setLoading(false)
  }

  const handleClose = () => { reset(); onClose() }

  const submit = async (e) => {
    e.preventDefault()
    if (!question.trim()) return
    setLoading(true)
    setAnswer(null)
    setError(null)
    try {
      const res  = await fetch('/api/wiki-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setAnswer(data.answer)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* Backdrop */}
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div class="relative w-full max-w-2xl glass-card p-6 shadow-2xl">
        {/* Header */}
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-semibold text-white">Ask about my infrastructure</h2>
          <button
            onClick={handleClose}
            class="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} class="flex gap-3 mb-4">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onInput={(e) => setQuestion(e.target.value)}
            placeholder="How does the VPN failover work?"
            class="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-violet-400/50"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            class="px-5 py-2 bg-violet-500/20 border border-violet-400/30 text-violet-300 rounded-lg hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '...' : 'Ask'}
          </button>
        </form>

        {/* States */}
        {loading && (
          <div class="flex items-center gap-2 text-white/40 text-sm">
            <div class="w-4 h-4 border border-white/20 border-t-violet-400 rounded-full animate-spin" />
            Thinking...
          </div>
        )}
        {error && <p class="text-red-400/80 text-sm">{error}</p>}
        {answer && !loading && (
          <div
            class="wiki-answer max-h-72 overflow-y-auto pr-1"
            dangerouslySetInnerHTML={{ __html: marked.parse(answer) }}
          />
        )}
      </div>
    </div>
  )
}
