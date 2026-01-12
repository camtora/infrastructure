export function Header({ status, lastUpdate, adminAuth }) {
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
            <span class="gradient-text font-medium">CAM TORA</span>
            <span class="text-white/40 mx-2">|</span>
            <span class="text-white/60">Status</span>
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
          {adminAuth?.is_admin && (
            <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20">
              <svg class="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span class="text-xs text-violet-300">Admin</span>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
