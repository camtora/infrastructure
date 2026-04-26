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

  // Stop spinner when uptime drops low (container restarted and status refreshed)
  const [uptimeBeforeRestart, setUptimeBeforeRestart] = useState(null)

  useEffect(() => {
    if (restarting && uptimeBeforeRestart && internal?.container_uptime) {
      // Stop if uptime is now lower than before (container restarted)
      if (internal.container_uptime < uptimeBeforeRestart) {
        setRestarting(false)
        setUptimeBeforeRestart(null)
      }
    }
  }, [internal?.container_uptime, restarting, uptimeBeforeRestart])

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
      color: 'text-violet-400',
      bg: 'bg-violet-400',
      bgLight: '',
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

  // Extract subdomain for display — prefer explicit display_url, fall back to stripping url
  const displayUrl = service.display_url
    ?? service.url
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
    setUptimeBeforeRestart(internal?.container_uptime || 9999)

    const result = await onRestart(containerName)

    if (!result.success) {
      setError(result.error)
      setRestarting(false)
      setUptimeBeforeRestart(null)
    }
    // Spinner stops when useEffect detects uptime change from status refresh
  }

  // Can restart if admin, has container name, and container isn't health-api
  const canRestart = isAdmin && containerName && containerName !== 'health-api'

  return (
    <div class="status-card group">
      <div class="mb-3">
        {/* Name row: name left, status badge right */}
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-medium text-white truncate group-hover:text-violet-400 transition-colors flex-1 min-w-0">
            {service.name}
          </h3>
          <span class={`text-xs font-medium flex-shrink-0 ${config.color} ${statusType !== 'up' ? `px-2 py-1 rounded-md border ${config.bgLight}` : ''}`}>
            {config.label}
          </span>
        </div>
        {/* URL row: url left, uptime far right (aligned under status badge) */}
        <div class="flex items-center justify-between gap-2 mt-0.5">
          {service.category !== 'api' && displayUrl ? (
            <a href={`https://${displayUrl}`} target="_blank" rel="noopener noreferrer"
              class="text-xs text-white/40 truncate hover:text-white/70 transition-colors flex-1 min-w-0">
              {displayUrl}
            </a>
          ) : (
            <p class="text-xs text-white/40 truncate flex-1 min-w-0">{displayUrl}</p>
          )}
          {internal?.container_uptime != null && (
            <span class={`text-xs tabular-nums flex-shrink-0 ${internal.container_uptime < 300 ? 'text-emerald-400' : 'text-white/40'}`}>
              Up {formatUptime(internal.container_uptime)}
            </span>
          )}
        </div>
      </div>

      {/* Internal status indicators */}
      {internal && (
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
          <div class="flex items-center gap-4">
            <span class={`text-xs ${internal.container_running ? 'text-white/60' : 'text-red-400/80'}`}>Container</span>
            <span class={`text-xs ${internal.port_responding ? 'text-white/60' : 'text-red-400/80'}`}>Local</span>
          </div>
          <div class="flex items-center gap-3">
            {service.response_time_ms !== null && service.response_time_ms !== undefined && (
              <span class="text-xs text-white/40 tabular-nums">{service.response_time_ms}ms</span>
            )}
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
