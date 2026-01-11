export function Header({ status, lastUpdate, onRefresh }) {
  const overallStatus = status?.overall_status || 'unknown'
  const summary = status?.summary || {}

  const statusConfig = {
    healthy: {
      color: 'text-green-400',
      bg: 'bg-green-500',
      label: 'All Systems Operational',
      pulse: 'status-pulse-green',
    },
    degraded: {
      color: 'text-yellow-400',
      bg: 'bg-yellow-500',
      label: 'Partial Outage',
      pulse: '',
    },
    unhealthy: {
      color: 'text-red-400',
      bg: 'bg-red-500',
      label: 'Major Outage',
      pulse: 'status-pulse-red',
    },
    unknown: {
      color: 'text-gray-400',
      bg: 'bg-gray-500',
      label: 'Status Unknown',
      pulse: '',
    },
  }

  const config = statusConfig[overallStatus] || statusConfig.unknown

  return (
    <header class="mb-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold text-white mb-2">
            camerontora.ca Status
          </h1>
          <div class="flex items-center gap-3">
            <span class={`w-4 h-4 rounded-full ${config.bg} ${config.pulse}`}></span>
            <span class={`text-lg font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="text-right text-sm text-gray-400">
            <p>{summary.services_up || 0} / {summary.services_total || 0} services up</p>
            {summary.uptime_percent !== undefined && (
              <p>{summary.uptime_percent}% uptime</p>
            )}
          </div>
          <button
            onClick={onRefresh}
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </header>
  )
}
