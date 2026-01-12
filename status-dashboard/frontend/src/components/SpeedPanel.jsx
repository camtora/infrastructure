export function SpeedPanel({ speedTest }) {
  if (!speedTest || speedTest.error) {
    return (
      <div class="glass-card p-6 h-full">
        <h2 class="text-lg font-medium text-white mb-4">Speed Test</h2>
        <p class="text-white/40 text-sm">
          {speedTest?.error || 'Speed test data unavailable'}
        </p>
      </div>
    )
  }

  const { home, vpn } = speedTest

  // Sort VPN locations: active first, then alphabetically
  const vpnEntries = vpn && typeof vpn === 'object'
    ? Object.entries(vpn).sort(([, a], [, b]) => {
        if (a?.active && !b?.active) return -1
        if (!a?.active && b?.active) return 1
        return 0
      })
    : []

  return (
    <div class="glass-card p-6 h-full">
      <h2 class="text-lg font-medium text-white mb-6">Speed Test</h2>

      <div class="space-y-6">
        {home && (
          <SpeedSection
            title="Home Connection"
            download={home.download}
            upload={home.upload}
            ping={home.ping}
          />
        )}

        {vpnEntries.length > 0 && (
          <div>
            <h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-4">VPN Locations</h3>
            <div class="space-y-3">
              {vpnEntries.map(([location, data]) => (
                <VpnLocationCard
                  key={location}
                  location={location}
                  data={data}
                />
              ))}
            </div>
          </div>
        )}

        {speedTest.timestamp && (
          <p class="text-xs text-white/30 text-center pt-2">
            Last tested: {new Date(speedTest.timestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}

function VpnLocationCard({ location, data }) {
  const status = data?.status || (data?.download ? 'healthy' : 'unknown')
  const isActive = data?.active === true

  const statusConfig = {
    healthy: { color: 'bg-emerald-400', textColor: 'text-emerald-400', label: 'Healthy' },
    unhealthy: { color: 'bg-red-400', textColor: 'text-red-400', label: 'Unhealthy' },
    error: { color: 'bg-amber-400', textColor: 'text-amber-400', label: 'Error' },
    stopped: { color: 'bg-white/30', textColor: 'text-white/50', label: 'Stopped' },
    unknown: { color: 'bg-white/30', textColor: 'text-white/50', label: 'Unknown' }
  }

  const { color, textColor, label } = statusConfig[status] || statusConfig.unknown

  return (
    <div class={`rounded-lg p-3 transition-all duration-200 ${
      isActive
        ? 'bg-cyan-500/10 border border-cyan-400/30'
        : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05]'
    }`}>
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class={`w-2 h-2 rounded-full ${color}`}></span>
          <span class="text-white font-medium text-sm">{location}</span>
          {isActive && (
            <span class="text-[10px] bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-medium px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </div>
        <span class={`text-xs ${textColor}`}>
          {label}
        </span>
      </div>

      {status === 'healthy' && data?.download ? (
        <div class="flex items-center gap-4 text-sm">
          <div class="flex items-center gap-1.5 text-white/60">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span class="tabular-nums">{data.download.toFixed(1)} Mbps</span>
          </div>
          {data.upload && (
            <div class="flex items-center gap-1.5 text-white/60">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span class="tabular-nums">{data.upload.toFixed(1)} Mbps</span>
            </div>
          )}
        </div>
      ) : (
        <p class="text-xs text-white/40">
          {status === 'unhealthy' ? 'DNS/network issue' :
           status === 'stopped' ? 'Container not running' :
           'No speed data'}
        </p>
      )}
    </div>
  )
}

function SpeedSection({ title, download, upload, ping }) {
  return (
    <div>
      <h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">{title}</h3>
      <div class="grid grid-cols-3 gap-3">
        <SpeedStat
          label="Download"
          value={download}
          unit="Mbps"
          icon={
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          }
        />
        <SpeedStat
          label="Upload"
          value={upload}
          unit="Mbps"
          icon={
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          }
        />
        <SpeedStat
          label="Ping"
          value={ping}
          unit="ms"
          icon={
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>
    </div>
  )
}

function SpeedStat({ label, value, unit, icon }) {
  const displayValue = value !== null && value !== undefined ? value : '—'

  return (
    <div class="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
      <div class="text-white/40 mb-2 flex justify-center">{icon}</div>
      <p class="text-lg font-semibold text-white tabular-nums">
        {typeof displayValue === 'number' ? displayValue.toFixed(1) : displayValue}
      </p>
      <p class="text-xs text-white/40">{unit}</p>
    </div>
  )
}
