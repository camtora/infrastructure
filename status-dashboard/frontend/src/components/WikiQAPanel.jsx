import { useState, useEffect, useRef } from 'preact/hooks'
import { marked } from 'marked'

export function WikiQAModal({ isOpen, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const inputRef  = useRef(null)
  const threadRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    setTimeout(() => inputRef.current?.focus(), 50)
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages.length, loading])

  const startNew = () => {
    setMessages([])
    setError(null)
  }

  const submit = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    const nextMessages = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/wiki-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setMessages([...nextMessages, { role: 'assistant', content: data.reply }])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  if (!isOpen) return null

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div class="relative w-full max-w-5xl glass-card p-6 shadow-2xl">
        {/* Header */}
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-white">Ask about my infrastructure</h2>
          <div class="flex items-center gap-2">
            <button
              onClick={startNew}
              class="px-3 py-1 text-xs text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 rounded-lg transition-colors"
            >
              New conversation
            </button>
            <button
              onClick={onClose}
              class="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Thread */}
        <div ref={threadRef} class="h-[62vh] overflow-y-auto mb-3 flex flex-col gap-3 pr-1">
          {messages.length === 0 && !loading && (
            <div class="flex-1 flex items-center justify-center">
              <p class="text-white/30 italic text-sm">Ask anything about this infrastructure...</p>
            </div>
          )}

          {messages.map((msg, i) =>
            msg.role === 'user' ? (
              <div key={i} class="flex flex-col items-end">
                <span class="text-xs text-white/40 mb-1 mr-1">You</span>
                <div class="bg-white/10 text-white rounded-xl px-4 py-2.5 max-w-[80%] ml-auto text-sm whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={i} class="flex flex-col items-start">
                <span class="text-xs text-violet-400/60 mb-1 ml-1">Claude</span>
                <div
                  class="wiki-answer bg-violet-500/10 border border-violet-400/10 text-white/90 rounded-xl px-4 py-2.5 max-w-[80%] text-sm"
                  dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }}
                />
              </div>
            )
          )}

          {loading && (
            <div class="flex flex-col items-start">
              <span class="text-xs text-violet-400/60 mb-1 ml-1">Claude</span>
              <div class="bg-violet-500/10 border border-violet-400/10 text-white/60 rounded-xl px-4 py-2.5">
                <span class="inline-flex gap-1 items-center">
                  <span class="w-1.5 h-1.5 bg-violet-400/60 rounded-full animate-bounce" style="animation-delay:0ms" />
                  <span class="w-1.5 h-1.5 bg-violet-400/60 rounded-full animate-bounce" style="animation-delay:150ms" />
                  <span class="w-1.5 h-1.5 bg-violet-400/60 rounded-full animate-bounce" style="animation-delay:300ms" />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && <p class="text-red-400/80 text-sm mb-3">{error}</p>}

        {/* Input row */}
        <div class="flex gap-3">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onInput={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="How does the VPN failover work?"
            class="flex-1 resize-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-violet-400/50 text-sm"
            disabled={loading}
          />
          <button
            onClick={submit}
            disabled={loading || !input.trim()}
            class="px-5 py-2 self-end bg-violet-500/20 border border-violet-400/30 text-violet-300 rounded-lg hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
