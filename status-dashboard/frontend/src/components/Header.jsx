export function Header({ status, lastUpdate, onRefresh }) {
  const overallStatus = status?.overall_status || 'unknown'
  const summary = status?.summary || {}

  const statusConfig = {
    healthy: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-400',
      glow: 'glow-emerald',
      label: 'All Systems Operational',
      pulse: 'status-pulse-green',
    },
    degraded: {
      color: 'text-amber-400',
      bg: 'bg-amber-400',
      glow: '',
      label: 'Partial Outage',
      pulse: '',
    },
    unhealthy: {
      color: 'text-red-400',
      bg: 'bg-red-500',
      glow: 'glow-red',
      label: 'Major Outage',
      pulse: 'status-pulse-red',
    },
    unknown: {
      color: 'text-white/50',
      bg: 'bg-white/30',
      glow: '',
      label: 'Status Unknown',
      pulse: '',
    },
  }

  const config = statusConfig[overallStatus] || statusConfig.unknown

  return (
    <header class="mb-10">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <h1 class="text-3xl font-light text-white mb-3 tracking-tight">
            <span class="gradient-text font-medium">camerontora.ca</span>
            <span class="text-white/60 ml-2">Status</span>
          </h1>
          <div class="flex items-center gap-3">
            <span class={`w-3 h-3 rounded-full ${config.bg} ${config.pulse} ${config.glow}`}></span>
            <span class={`text-sm font-medium ${config.color}`}>
              {config.label}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-6">
          <div class="text-right">
            <p class="text-white/70 text-sm font-medium">
              {summary.services_up || 0} / {summary.services_total || 0}
              <span class="text-white/40 ml-1">services up</span>
            </p>
            {lastUpdate && (
              <p class="text-white/40 text-xs mt-1">
                Updated {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={onRefresh}
            class="btn-secondary flex items-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span class="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </header>
  )
}
