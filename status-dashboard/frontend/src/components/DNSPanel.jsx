import { useState } from 'preact/hooks'

export function DNSPanel({ dns }) {
  const [adminKey, setAdminKey] = useState(
    typeof localStorage !== 'undefined' ? localStorage.getItem('adminKey') || '' : ''
  )
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [failoverLoading, setFailoverLoading] = useState(false)
  const [failoverError, setFailoverError] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingTarget, setPendingTarget] = useState(null)

  if (!dns || dns.error) {
    return (
      <div class="glass-card p-6">
        <h2 class="text-lg font-medium text-white mb-4">DNS Status</h2>
        <p class="text-white/40 text-sm">
          {dns?.error ? `Error: ${dns.error}` : 'DNS information unavailable'}
        </p>
      </div>
    )
  }

  const isHome = dns.target === 'home'
  const hasTarget = dns.target !== undefined
  const targetLabel = hasTarget ? (isHome ? 'Home Server' : 'GCP Cloud') : 'Unknown'
  const targetColor = hasTarget ? (isHome ? 'text-emerald-400' : 'text-amber-400') : 'text-white/50'
  const targetBg = hasTarget ? (isHome ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-white/30'

  const saveAdminKey = (key) => {
    setAdminKey(key)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('adminKey', key)
    }
  }

  const initiateFailover = (target) => {
    setPendingTarget(target)
    setShowConfirm(true)
  }

  const executeFailover = async () => {
    setShowConfirm(false)
    setFailoverLoading(true)
    setFailoverError(null)

    try {
      const response = await fetch('/api/dns/failover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({
          target: pendingTarget,
          reason: 'Manual failover from dashboard',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failover failed')
      }

      window.location.reload()
    } catch (err) {
      setFailoverError(err.message)
    } finally {
      setFailoverLoading(false)
    }
  }

  return (
    <div class="glass-card p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">DNS Status</h2>
        <div class="flex items-center gap-2">
          <span class={`w-2.5 h-2.5 rounded-full ${targetBg}`}></span>
          <span class={`font-medium text-sm ${targetColor}`}>{targetLabel}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div class="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
          <p class="text-xs text-white/50 uppercase tracking-wider mb-2">Current IP</p>
          <p class="font-mono text-white text-sm">{dns.current_ip || 'Unknown'}</p>
        </div>
        <div class="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
          <p class="text-xs text-white/50 uppercase tracking-wider mb-2">Records Updated</p>
          <p class="text-white text-sm">{dns.record_count || 0} A records</p>
        </div>
      </div>

      {/* Admin Controls */}
      <div class="border-t border-white/[0.06] pt-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xs font-medium text-white/50 uppercase tracking-wider">Failover Controls</h3>
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            class="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            {showKeyInput ? 'Hide' : 'Configure'} Admin Key
          </button>
        </div>

        {showKeyInput && (
          <div class="mb-4">
            <input
              type="password"
              value={adminKey}
              onInput={(e) => saveAdminKey(e.target.value)}
              placeholder="Enter admin key"
              class="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.1] rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
            />
          </div>
        )}

        {failoverError && (
          <div class="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p class="text-sm text-red-400">{failoverError}</p>
          </div>
        )}

        <div class="flex gap-3">
          <button
            onClick={() => initiateFailover('home')}
            disabled={failoverLoading || isHome || !adminKey}
            class={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
              isHome
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 cursor-not-allowed'
                : adminKey
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                : 'bg-white/[0.03] border border-white/[0.06] text-white/30 cursor-not-allowed'
            }`}
          >
            {isHome ? 'Currently Home' : 'Switch to Home'}
          </button>
          <button
            onClick={() => initiateFailover('gcp')}
            disabled={failoverLoading || !isHome || !adminKey}
            class={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
              !isHome
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 cursor-not-allowed'
                : adminKey
                ? 'bg-amber-500 hover:bg-amber-400 text-black'
                : 'bg-white/[0.03] border border-white/[0.06] text-white/30 cursor-not-allowed'
            }`}
          >
            {!isHome ? 'Currently GCP' : 'Failover to GCP'}
          </button>
        </div>

        {!adminKey && (
          <p class="text-xs text-white/30 mt-3 text-center">
            Enter admin key to enable failover controls
          </p>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div class="glass-card p-6 max-w-md mx-4">
            <h3 class="text-lg font-medium text-white mb-3">Confirm DNS Failover</h3>
            <p class="text-white/70 text-sm mb-4">
              Are you sure you want to switch DNS to{' '}
              <span class="font-semibold text-white">
                {pendingTarget === 'home' ? 'Home Server' : 'GCP Cloud'}
              </span>
              ?
            </p>
            <p class="text-xs text-white/40 mb-6">
              This will update all camerontora.ca DNS records. Changes may take up to 10 minutes to propagate.
            </p>
            <div class="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                class="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={executeFailover}
                disabled={failoverLoading}
                class={`flex-1 px-4 py-2 rounded-lg text-black font-medium transition-all ${
                  pendingTarget === 'gcp'
                    ? 'bg-amber-500 hover:bg-amber-400'
                    : 'bg-emerald-500 hover:bg-emerald-400'
                }`}
              >
                {failoverLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
