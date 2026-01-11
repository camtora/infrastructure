export function StatusCard({ service }) {
  const statusConfig = {
    up: {
      color: 'text-green-400',
      bg: 'bg-green-500',
      bgLight: 'bg-green-500/20',
      label: 'Operational',
    },
    down: {
      color: 'text-red-400',
      bg: 'bg-red-500',
      bgLight: 'bg-red-500/20',
      label: 'Down',
    },
    degraded: {
      color: 'text-yellow-400',
      bg: 'bg-yellow-500',
      bgLight: 'bg-yellow-500/20',
      label: 'Degraded',
    },
  }

  const config = statusConfig[service.status] || statusConfig.down

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

      {service.error && (
        <p class="text-xs text-red-400 mt-2 truncate" title={service.error}>
          {service.error}
        </p>
      )}
    </div>
  )
}
