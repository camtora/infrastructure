import { useState } from 'preact/hooks'

export function DNSDrawer({ dns, adminAuth, isOpen, onClose }) {
  const [failoverLoading, setFailoverLoading] = useState(false)
  const [failoverError, setFailoverError]     = useState(null)
  const [failoverSuccess, setFailoverSuccess] = useState(null)
  const [showConfirm, setShowConfirm]         = useState(false)
  const [pendingTarget, setPendingTarget]     = useState(null)

  const isAdmin = adminAuth?.is_admin

  if (!isOpen) return null

  const initiateFailover = (target) => {
    setPendingTarget(target)
    setShowConfirm(true)
    setFailoverError(null)
    setFailoverSuccess(null)
  }

  const executeFailover = async () => {
    setShowConfirm(false)
    setFailoverLoading(true)
    setFailoverError(null)
    setFailoverSuccess(null)
    try {
      const response = await fetch('/api/dns/failover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target: pendingTarget, reason: 'Manual failover from dashboard' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failover failed')
      setFailoverSuccess(`DNS switched to ${pendingTarget}. Changes may take a few minutes to propagate.`)
      setTimeout(() => window.location.reload(), 3000)
    } catch (err) {
      setFailoverError(err.message)
    } finally {
      setFailoverLoading(false)
    }
  }

  const isHome = dns?.target === 'home'
  const homeIp = dns?.home_ip || 'Unknown'
  const gcpIp  = dns?.gcp_ip  || 'Unknown'

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div class="relative w-full max-w-sm glass-card p-5 shadow-2xl">
        <button onClick={onClose} class="absolute top-3 right-3 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="mb-4 pt-1">
          <h2 class="text-base font-medium text-white text-center mb-1">DNS Configuration</h2>
          <p class="text-xs text-white/40 leading-relaxed text-center">
            When home is down, point camerontora.ca to GCP so visitors see this status page instead of an SSL error.
            <br /><span class="text-white/30">Public service A records will be modified.</span>
          </p>
        </div>

        {(!dns || dns.error) ? (
          <p class="text-white/40 text-sm">{dns?.error || 'DNS information unavailable'}</p>
        ) : (
          <div class="space-y-2">
            {/* CAMNAS2 */}
            <div class={`rounded-lg p-3 transition-all ${isHome ? 'bg-violet-500/10 border border-violet-500/40' : 'bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05]'}`}>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <svg class="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span class="text-xs font-medium text-white/60 uppercase tracking-wider">CAMNAS2</span>
                </div>
                {isHome ? (
                  <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                    <span class="text-xs text-violet-400">Active</span>
                  </div>
                ) : isAdmin ? (
                  <button onClick={() => initiateFailover('home')} disabled={failoverLoading}
                    class="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all">
                    Switch
                  </button>
                ) : <span class="text-xs text-white/30">Standby</span>}
              </div>
              <p class="font-mono text-white/80 text-sm mt-1.5">{homeIp}</p>
            </div>

            {/* GCP Cloud */}
            <div class={`rounded-lg p-3 transition-all ${!isHome ? 'bg-violet-500/10 border border-violet-500/40' : 'bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05]'}`}>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <svg class="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                  <span class="text-xs font-medium text-white/60 uppercase tracking-wider">GCP Cloud</span>
                </div>
                {!isHome ? (
                  <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                    <span class="text-xs text-violet-400">Active</span>
                  </div>
                ) : isAdmin ? (
                  <button onClick={() => initiateFailover('gcp')} disabled={failoverLoading}
                    class="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-all">
                    Failover
                  </button>
                ) : <span class="text-xs text-white/30">Standby</span>}
              </div>
              <p class="font-mono text-white/80 text-sm mt-1.5">{gcpIp}</p>
            </div>

            {failoverError   && <p class="text-xs text-red-400 mt-2">{failoverError}</p>}
            {failoverSuccess && <p class="text-xs text-emerald-400 mt-2">{failoverSuccess}</p>}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div class="absolute inset-0 flex items-center justify-center z-10">
          <div class="glass-card p-5 max-w-xs mx-4 w-full">
            <h3 class="text-base font-medium text-white mb-2">Confirm Failover</h3>
            <p class="text-white/60 text-sm mb-4">
              Switch to <span class="text-white font-medium">{pendingTarget === 'home' ? 'CAMNAS2' : 'GCP Cloud'}</span>? May take up to 10 min to propagate.
            </p>
            <div class="flex gap-2">
              <button onClick={() => setShowConfirm(false)} class="btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={executeFailover} disabled={failoverLoading}
                class={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${pendingTarget === 'gcp' ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-emerald-500 text-black hover:bg-emerald-400'}`}>
                {failoverLoading ? 'Switching...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
