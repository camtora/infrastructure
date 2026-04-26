export function Header({ status, lastUpdate, adminAuth, onEmergencyClick, apiKeyActive, onAskClick, onDnsClick, dnsOpen, onRebootClick }) {
  const overallStatus = status?.overall_status || 'unknown'

  const statusConfig = {
    healthy:  { color: 'text-white',       bg: 'bg-white/70',   glow: '',          blockGlow: '',           label: 'All Systems Operational', pulse: 'status-pulse-white' },
    degraded: { color: 'text-amber-400',   bg: 'bg-amber-400',  glow: '',          blockGlow: 'glow-amber',  label: 'Performance Degraded',    pulse: '' },
    minor:    { color: 'text-orange-400',  bg: 'bg-orange-400', glow: '',          blockGlow: 'glow-orange', label: 'Minor Outage',            pulse: '' },
    major:    { color: 'text-red-400',     bg: 'bg-red-500',    glow: 'glow-red',  blockGlow: 'glow-red',    label: 'Major Outage',            pulse: 'status-pulse-red' },
    unknown:  { color: 'text-white/50',    bg: 'bg-white/30',   glow: '',          blockGlow: '',            label: 'Status Unknown',          pulse: '' },
  }

  const config = statusConfig[overallStatus] || statusConfig.unknown

  // Status indicator — reused in both layouts
  const statusIndicator = (size) => (
    <div class="flex items-center gap-2.5">
      <span class={`${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} rounded-full flex-shrink-0 ${config.bg} ${config.pulse} ${config.glow}`} />
      <p class={`${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium ${config.color}`}>{config.label}</p>
    </div>
  )

  // Buttons — shared between mobile and desktop
  const buttons = (
    <div class="flex items-center flex-wrap gap-2">
      <button
        onClick={onAskClick}
        class="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white/5 border-white/10 hover:bg-emerald-500/10 hover:border-emerald-400/30 transition-all duration-200"
        title="Ask about my infrastructure"
      >
        <svg class="w-3.5 h-3.5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
        </svg>
        <span class="text-xs text-white/50">Ask</span>
      </button>

      <button
        onClick={onDnsClick}
        class={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-200 ${dnsOpen ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/50'}`}
        title="DNS Configuration"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
        </svg>
        <span class="text-xs">DNS</span>
      </button>

      {adminAuth?.is_admin && (
        <button
          onClick={onRebootClick}
          class="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-red-500/10 border-red-500/20 hover:bg-red-500/20 transition-all duration-200"
          title="Restart Server"
        >
          <svg class="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span class="text-xs text-red-400">Restart</span>
        </button>
      )}

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
        <div
          class={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${adminAuth.cached ? 'bg-amber-500/10 border-amber-500/20' : 'bg-violet-500/10 border-violet-500/20'}`}
          title={adminAuth.cached ? 'Using cached credentials (home server may be down)' : ''}
        >
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
            href={`https://health.camerontora.ca/oauth2/start?rd=${encodeURIComponent(window.location.origin)}`}
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
  )

  const titleEl = (
    <h1 class="text-2xl sm:text-3xl font-light text-white tracking-tight">
      <span class="font-medium" style="background: linear-gradient(to right, #a78bfa, #ffffff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">CAM TORA</span>
      <span class="text-white/40 mx-2">|</span>
      <span class="text-white/60">Status</span>
    </h1>
  )

  return (
    <header class="mb-10">

      {/* ── Mobile (< sm): title + status on one row, buttons below ── */}
      <div class="sm:hidden flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          {titleEl}
          {statusIndicator('sm')}
        </div>
        {buttons}
      </div>

      {/* ── Desktop (sm+): 3-col grid ── */}
      <div class="hidden sm:grid grid-cols-3 items-center gap-4">
        <div>{titleEl}</div>
        <div class="flex flex-col items-center gap-1">
          {statusIndicator('md')}
        </div>
        <div class="flex flex-col items-end gap-2">
          {buttons}
        </div>
      </div>

    </header>
  )
}
