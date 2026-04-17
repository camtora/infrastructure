import { useState } from 'preact/hooks'
import { marked } from 'marked'

export function WikiQAPanel() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!question.trim()) return
    setLoading(true)
    setAnswer(null)
    setError(null)
    try {
      const res = await fetch('/api/wiki-qa', {
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

  return (
    <div class="glass-card p-6 mb-8">
      <h2 class="text-lg font-semibold text-white mb-4">Ask about my infrastructure</h2>
      <form onSubmit={submit} class="flex gap-3 mb-4">
        <input
          type="text"
          value={question}
          onInput={(e) => setQuestion(e.target.value)}
          placeholder="How does the VPN failover work?"
          class="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/50"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          class="px-5 py-2 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 rounded-lg hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '...' : 'Ask'}
        </button>
      </form>

      {loading && (
        <div class="flex items-center gap-2 text-white/40 text-sm">
          <div class="w-4 h-4 border border-white/20 border-t-emerald-400 rounded-full animate-spin" />
          Thinking...
        </div>
      )}

      {error && (
        <p class="text-red-400/80 text-sm">{error}</p>
      )}

      {answer && !loading && (
        <div
          class="wiki-answer"
          dangerouslySetInnerHTML={{ __html: marked.parse(answer) }}
        />
      )}
    </div>
  )
}
