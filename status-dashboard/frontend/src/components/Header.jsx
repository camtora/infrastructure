export function Header({ status, lastUpdate, adminAuth, onEmergencyClick, apiKeyActive }) {
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
      label: 'Performance Degraded',
      pulse: '',
    },
    minor: {
      color: 'text-orange-400',
      bg: 'bg-orange-400',
      glow: '',
      label: 'Minor Outage',
      pulse: '',
    },
    major: {
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
          {apiKeyActive ? (
            <button
              onClick={onEmergencyClick}
              class="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20 transition-all duration-200"
              title="Using API key authentication (click to manage)"
            >
              <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span class="text-xs text-amber-300">Admin (API Key)</span>
            </button>
          ) : adminAuth?.is_admin ? (
            <div class={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
              adminAuth.cached
                ? 'bg-amber-500/10 border-amber-500/20'
                : 'bg-violet-500/10 border-violet-500/20'
            }`} title={adminAuth.cached ? 'Using cached credentials (home server may be down)' : ''}>
              <svg class={`w-3.5 h-3.5 ${adminAuth.cached ? 'text-amber-400' : 'text-violet-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span class={`text-xs ${adminAuth.cached ? 'text-amber-300' : 'text-violet-300'}`}>
                {adminAuth.cached ? 'Admin (Cached)' : 'Admin'}
              </span>
            </div>
          ) : (
            <div class="flex items-center gap-2">
              <a
                href="https://health.camerontora.ca/oauth2/start?rd=https://status.camerontora.ca"
                class="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-200"
              >
                <svg class="w-3.5 h-3.5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span class="text-xs text-white/50">Login</span>
              </a>
              <button
                onClick={onEmergencyClick}
                class="p-1.5 rounded-full border bg-white/5 border-white/10 hover:bg-amber-500/10 hover:border-amber-500/20 transition-all duration-200"
                title="Emergency access (API key)"
              >
                <svg class="w-3.5 h-3.5 text-white/40 hover:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
