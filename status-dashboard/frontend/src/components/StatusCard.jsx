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
    statusType = 'up' // External works, internal unknown/down (rare)
  } else if (!externalUp && internalUp) {
    statusType = 'network' // Service works locally but not externally
    issueType = 'Network/Proxy'
  } else if (!externalUp && internal && !internalUp) {
    statusType = 'down' // Both down = service issue
    issueType = 'Service'
  } else if (!externalUp && !internal) {
    statusType = 'down' // No internal data, just show down
  }

  const statusConfig = {
    up: {
      color: 'text-green-400',
      bg: 'bg-green-500',
      bgLight: 'bg-green-500/20',
      label: 'Operational',
    },
    network: {
      color: 'text-orange-400',
      bg: 'bg-orange-500',
      bgLight: 'bg-orange-500/20',
      label: 'Network Issue',
    },
    down: {
      color: 'text-red-400',
      bg: 'bg-red-500',
      bgLight: 'bg-red-500/20',
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
    <div class="status-card">
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1 min-w-0">
          <h3 class="font-medium text-white truncate">{service.name}</h3>
          <p class="text-xs text-gray-500 truncate">{displayUrl}</p>
        </div>
        <span class={`w-3 h-3 rounded-full ${config.bg} flex-shrink-0 ml-2`}></span>
      </div>

      <div class="flex items-center justify-between">
        <span class={`text-sm font-medium ${config.color} px-2 py-0.5 rounded ${config.bgLight}`}>
          {config.label}
        </span>
        {service.response_time_ms !== null && service.response_time_ms !== undefined && (
          <span class="text-xs text-gray-400">
            {service.response_time_ms}ms
          </span>
        )}
      </div>

      {/* Internal status indicators */}
      {internal && (
        <div class="flex items-center gap-3 mt-2 text-xs">
          <span class={internal.container_running ? 'text-green-500' : 'text-red-500'} title="Container">
            {internal.container_running ? '●' : '○'} Container
          </span>
          <span class={internal.port_responding ? 'text-green-500' : 'text-red-500'} title="Local Port">
            {internal.port_responding ? '●' : '○'} Local
          </span>
        </div>
      )}

      {service.error && (
        <p class="text-xs text-red-400 mt-2 truncate" title={service.error}>
          {issueType ? `${issueType}: ` : ''}{service.error}
        </p>
      )}
    </div>
  )
}
