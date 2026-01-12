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
      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-xl font-semibold text-white mb-4">DNS Status</h2>
        <p class="text-gray-400">
          {dns?.error ? `Error: ${dns.error}` : 'DNS information unavailable'}
        </p>
      </div>
    )
  }

  const isHome = dns.target === 'home'
  const hasTarget = dns.target !== undefined
  const targetLabel = hasTarget ? (isHome ? 'Home Server' : 'GCP Cloud') : 'Unknown'
  const targetColor = hasTarget ? (isHome ? 'text-green-400' : 'text-yellow-400') : 'text-gray-400'
  const targetBg = hasTarget ? (isHome ? 'bg-green-500' : 'bg-yellow-500') : 'bg-gray-500'

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

      // Reload page to refresh DNS state
      window.location.reload()
    } catch (err) {
      setFailoverError(err.message)
    } finally {
      setFailoverLoading(false)
    }
  }

  return (
    <div class="bg-gray-800 rounded-lg p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold text-white">DNS Status</h2>
        <div class="flex items-center gap-2">
          <span class={`w-3 h-3 rounded-full ${targetBg}`}></span>
          <span class={`font-medium ${targetColor}`}>{targetLabel}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div class="bg-gray-700/50 rounded-lg p-4">
          <p class="text-sm text-gray-400 mb-1">Current IP</p>
          <p class="font-mono text-white">{dns.current_ip || 'Unknown'}</p>
        </div>
        <div class="bg-gray-700/50 rounded-lg p-4">
          <p class="text-sm text-gray-400 mb-1">Records Updated</p>
          <p class="text-white">{dns.record_count || 0} A records</p>
        </div>
      </div>

      {/* Admin Controls */}
      <div class="border-t border-gray-700 pt-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-medium text-gray-400">Failover Controls</h3>
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            class="text-xs text-blue-400 hover:text-blue-300"
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
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {failoverError && (
          <div class="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg">
            <p class="text-sm text-red-200">{failoverError}</p>
          </div>
        )}

        <div class="flex gap-3">
          <button
            onClick={() => initiateFailover('home')}
            disabled={failoverLoading || isHome || !adminKey}
            class={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              isHome
                ? 'bg-green-900/50 text-green-400 cursor-not-allowed'
                : adminKey
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isHome ? 'Currently Home' : 'Switch to Home'}
          </button>
          <button
            onClick={() => initiateFailover('gcp')}
            disabled={failoverLoading || !isHome || !adminKey}
            class={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              !isHome
                ? 'bg-yellow-900/50 text-yellow-400 cursor-not-allowed'
                : adminKey
                ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {!isHome ? 'Currently GCP' : 'Failover to GCP'}
          </button>
        </div>

        {!adminKey && (
          <p class="text-xs text-gray-500 mt-2 text-center">
            Enter admin key to enable failover controls
          </p>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div class="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
            <h3 class="text-lg font-bold text-white mb-2">Confirm DNS Failover</h3>
            <p class="text-gray-300 mb-4">
              Are you sure you want to switch DNS to{' '}
              <span class="font-bold">
                {pendingTarget === 'home' ? 'Home Server' : 'GCP Cloud'}
              </span>
              ?
            </p>
            <p class="text-sm text-gray-400 mb-6">
              This will update all camerontora.ca DNS records. Changes may take up to 10 minutes to propagate.
            </p>
            <div class="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                class="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
              >
                Cancel
              </button>
              <button
                onClick={executeFailover}
                disabled={failoverLoading}
                class={`flex-1 px-4 py-2 rounded-lg text-white font-medium ${
                  pendingTarget === 'gcp'
                    ? 'bg-yellow-600 hover:bg-yellow-500'
                    : 'bg-green-600 hover:bg-green-500'
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
