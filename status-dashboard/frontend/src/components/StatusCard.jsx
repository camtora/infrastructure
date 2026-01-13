import { useState, useEffect } from 'preact/hooks'

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return null
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function StatusCard({ service, adminAuth, onRestart }) {
  const [restarting, setRestarting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)

  const internal = service.internal
  const externalUp = service.status === 'up'
  const internalUp = internal?.container_running && internal?.port_responding
  const isAdmin = adminAuth?.is_admin
  const containerName = internal?.container_name

  // Auto-reset confirm state after 3 seconds
  useEffect(() => {
    if (confirming) {
      const timer = setTimeout(() => setConfirming(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [confirming])

  // Determine overall status and issue type
  let statusType = 'down'
  let issueType = null

  if (externalUp && internalUp) {
    statusType = 'up'
  } else if (externalUp && !internalUp) {
    statusType = 'up'
  } else if (!externalUp && internalUp) {
    statusType = 'network'
    issueType = 'Network/Proxy'
  } else if (!externalUp && internal && !internalUp) {
    statusType = 'down'
    issueType = 'Service'
  } else if (!externalUp && !internal) {
    statusType = 'down'
  }

  const statusConfig = {
    up: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-400',
      bgLight: 'bg-emerald-400/10 border-emerald-400/20',
      label: 'Operational',
    },
    network: {
      color: 'text-amber-400',
      bg: 'bg-amber-400',
      bgLight: 'bg-amber-400/10 border-amber-400/20',
      label: 'Network Issue',
    },
    down: {
      color: 'text-red-400',
      bg: 'bg-red-500',
      bgLight: 'bg-red-500/10 border-red-500/20',
      label: 'Down',
    },
  }

  const config = statusConfig[statusType] || statusConfig.down

  // Extract subdomain for display
  const displayUrl = service.url
    ?.replace('https://', '')
    ?.replace('http://', '')
    ?.split('/')[0]

  const handleRestartClick = async () => {
    if (!confirming) {
      setConfirming(true)
      setError(null)
      return
    }

    // Confirmed - do restart
    setConfirming(false)
    setRestarting(true)
    setError(null)

    const startTime = Date.now()
    const result = await onRestart(containerName)

    if (!result.success) {
      setError(result.error)
    }

    // Keep spinner visible for at least 2 seconds for feedback
    const elapsed = Date.now() - startTime
    if (elapsed < 2000) {
      await new Promise(r => setTimeout(r, 2000 - elapsed))
    }

    setRestarting(false)
  }

  // Can restart if admin, has container name, and container isn't health-api
  const canRestart = isAdmin && containerName && containerName !== 'health-api'

  return (
    <div class="status-card group">
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1 min-w-0">
          <h3 class="font-medium text-white truncate group-hover:text-emerald-400 transition-colors">
            {service.name}
          </h3>
          <p class="text-xs text-white/40 truncate mt-0.5">{displayUrl}</p>
        </div>
        <span class={`w-2.5 h-2.5 rounded-full ${config.bg} flex-shrink-0 ml-3 mt-1`}></span>
      </div>

      <div class="flex items-center justify-between">
        <span class={`text-xs font-medium ${config.color} px-2 py-1 rounded-md border ${config.bgLight}`}>
          {config.label}
        </span>
        {service.response_time_ms !== null && service.response_time_ms !== undefined && (
          <span class="text-xs text-white/40 tabular-nums">
            {service.response_time_ms}ms
          </span>
        )}
      </div>

      {/* Internal status indicators */}
      {internal && (
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
          <div class="flex items-center gap-4">
            <span class={`flex items-center gap-1.5 text-xs ${internal.container_running ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
              <span class={`w-1.5 h-1.5 rounded-full ${internal.container_running ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
              {internal.container_uptime ? `Up ${formatUptime(internal.container_uptime)}` : 'Container'}
            </span>
            <span class={`flex items-center gap-1.5 text-xs ${internal.port_responding ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
              <span class={`w-1.5 h-1.5 rounded-full ${internal.port_responding ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
              Local
            </span>
          </div>

          {/* Restart button - admin only */}
          {canRestart && (
            <button
              type="button"
              onClick={handleRestartClick}
              disabled={restarting}
              class={`text-xs px-2 py-1 rounded transition-all ${
                restarting
                  ? 'bg-amber-500/20 text-amber-400 cursor-wait'
                  : confirming
                  ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50 animate-pulse'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
              }`}
              title={`Restart ${containerName}`}
            >
              {restarting ? (
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : confirming ? (
                'Confirm?'
              ) : (
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>
          )}
        </div>
      )}

      {service.error && (
        <p class="text-xs text-red-400/80 mt-2 truncate" title={service.error}>
          {issueType ? `${issueType}: ` : ''}{service.error}
        </p>
      )}

      {error && (
        <p class="text-xs text-red-400/80 mt-2 truncate" title={error}>
          Restart failed: {error}
        </p>
      )}
    </div>
  )
}
