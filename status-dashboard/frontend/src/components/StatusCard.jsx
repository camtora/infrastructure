export function StatusCard({ service }) {
  const internal = service.internal
  const externalUp = service.status === 'up'
  const internalUp = internal?.container_running && internal?.port_responding

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
        <div class="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.06]">
          <span class={`flex items-center gap-1.5 text-xs ${internal.container_running ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
            <span class={`w-1.5 h-1.5 rounded-full ${internal.container_running ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
            Container
          </span>
          <span class={`flex items-center gap-1.5 text-xs ${internal.port_responding ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
            <span class={`w-1.5 h-1.5 rounded-full ${internal.port_responding ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
            Local
          </span>
        </div>
      )}

      {service.error && (
        <p class="text-xs text-red-400/80 mt-2 truncate" title={service.error}>
          {issueType ? `${issueType}: ` : ''}{service.error}
        </p>
      )}
    </div>
  )
}
