import { useState } from 'preact/hooks'

export function DNSPanel({ dns, adminAuth }) {
  const [failoverLoading, setFailoverLoading] = useState(false)
  const [failoverError, setFailoverError] = useState(null)
  const [failoverSuccess, setFailoverSuccess] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingTarget, setPendingTarget] = useState(null)

  const isAdmin = adminAuth?.is_admin

  if (!dns || dns.error) {
    return (
      <div class="glass-card p-6">
        <h2 class="text-lg font-medium text-white mb-4">DNS Configuration</h2>
        <p class="text-white/40 text-sm">
          {dns?.error ? `Error: ${dns.error}` : 'DNS information unavailable'}
        </p>
      </div>
    )
  }

  const isHome = dns.target === 'home'
  const homeIp = dns.home_ip || 'Unknown'
  const gcpIp = dns.gcp_ip || 'Unknown'

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
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          target: pendingTarget,
          reason: 'Manual failover from dashboard',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failover failed')
      }

      setFailoverSuccess(`DNS switched to ${pendingTarget}. Changes may take a few minutes to propagate.`)
      // Reload after a short delay to show updated state
      setTimeout(() => window.location.reload(), 3000)
    } catch (err) {
      setFailoverError(err.message)
    } finally {
      setFailoverLoading(false)
    }
  }

  return (
    <div class="glass-card p-6">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-medium text-white">DNS Configuration</h2>
        <div class="text-xs text-white/40">
          {dns.record_count || 0} A records
        </div>
      </div>
      <p class="text-xs text-white/40 mb-6">
        When home is down, point camerontora.ca to GCP so visitors see this status page instead of an SSL error.
      </p>

      {/* Mock data warning - only show to admins */}
      {isAdmin && dns.mock_data && (
        <div class="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p class="text-xs text-amber-400">
            <span class="font-medium">GoDaddy API unavailable</span> - showing estimated data.
            Failover will work when API access is restored.
          </p>
        </div>
      )}

      {/* Two-card layout showing both IPs */}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* CAMNAS2 Card */}
        <div class={`rounded-lg p-4 transition-all ${
          isHome
            ? 'bg-emerald-500/10 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
            : 'bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05]'
        }`}>
          <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span class="text-xs font-medium text-white/60 uppercase tracking-wider">CAMNAS2</span>
          </div>
          <p class="font-mono text-white text-lg mb-3">{homeIp}</p>
          {isHome ? (
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span class="text-xs font-medium text-emerald-400">Active</span>
            </div>
          ) : isAdmin ? (
            <button
              onClick={() => initiateFailover('home')}
              disabled={failoverLoading}
              class="w-full px-3 py-2 rounded-lg text-sm font-medium transition-all bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
            >
              {failoverLoading && pendingTarget === 'home' ? 'Switching...' : 'Switch to CAMNAS2'}
            </button>
          ) : (
            <span class="text-xs text-white/40">Standby</span>
          )}
        </div>

        {/* GCP Cloud Card */}
        <div class={`rounded-lg p-4 transition-all ${
          !isHome
            ? 'bg-amber-500/10 border-2 border-amber-500/50 shadow-lg shadow-amber-500/10'
            : 'bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05]'
        }`}>
          <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            <span class="text-xs font-medium text-white/60 uppercase tracking-wider">GCP Cloud</span>
          </div>
          <p class="font-mono text-white text-lg mb-3">{gcpIp}</p>
          {!isHome ? (
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span class="text-xs font-medium text-amber-400">Active</span>
            </div>
          ) : isAdmin ? (
            <button
              onClick={() => initiateFailover('gcp')}
              disabled={failoverLoading}
              class="w-full px-3 py-2 rounded-lg text-sm font-medium transition-all bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30"
            >
              {failoverLoading && pendingTarget === 'gcp' ? 'Switching...' : 'Failover to GCP'}
            </button>
          ) : (
            <span class="text-xs text-white/40">Standby</span>
          )}
        </div>
      </div>

      {/* Status Messages - only shown after admin actions */}
      {failoverError && (
        <div class="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p class="text-sm text-red-400">{failoverError}</p>
        </div>
      )}

      {failoverSuccess && (
        <div class="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <p class="text-sm text-emerald-400">{failoverSuccess}</p>
        </div>
      )}


      {/* Confirmation Modal */}
      {showConfirm && (
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div class="glass-card p-6 max-w-md mx-4">
            <h3 class="text-lg font-medium text-white mb-3">
              Confirm DNS Failover
            </h3>
            <p class="text-white/70 text-sm mb-4">
              Are you sure you want to switch DNS to{' '}
              <span class="font-semibold text-white">
                {pendingTarget === 'home' ? 'CAMNAS2' : 'GCP Cloud'}
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
