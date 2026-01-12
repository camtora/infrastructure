import { useState, useEffect } from 'preact/hooks'

export function SpeedPanel({ speedTest, adminAuth, vpnStatus, vpnSwitching, vpnMessage, onSwitchVpn }) {
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
  const isAdmin = adminAuth?.is_admin

  // Sort VPN locations: active first, then alphabetically
  const vpnEntries = vpn && typeof vpn === 'object'
    ? Object.entries(vpn).sort(([, a], [, b]) => {
        if (a?.active && !b?.active) return -1
        if (!a?.active && b?.active) return 1
        return 0
      })
    : []

  // Get admin VPN status for each location (for health info)
  const getAdminVpnInfo = (location) => {
    if (!vpnStatus?.locations) return null
    return vpnStatus.locations.find(l => l.name.toLowerCase() === location.toLowerCase())
  }

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
                  isAdmin={isAdmin}
                  adminInfo={getAdminVpnInfo(location)}
                  isSwitching={vpnSwitching === location.toLowerCase()}
                  onSwitch={() => onSwitchVpn(location.toLowerCase())}
                />
              ))}
            </div>
            {vpnMessage?.type === 'error' && (
              <div class="mt-3 text-xs text-red-400">
                {vpnMessage.text}
              </div>
            )}
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

function VpnLocationCard({ location, data, isAdmin, adminInfo, isSwitching, onSwitch }) {
  const [confirming, setConfirming] = useState(false)

  const status = data?.status || (data?.download ? 'healthy' : 'unknown')
  const isActive = data?.active === true
  const canSwitch = isAdmin && !isActive && adminInfo?.healthy && !isSwitching

  // Auto-reset confirm state after 3 seconds
  useEffect(() => {
    if (confirming) {
      const timer = setTimeout(() => setConfirming(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [confirming])

  // Reset confirm state when switching starts
  useEffect(() => {
    if (isSwitching) setConfirming(false)
  }, [isSwitching])

  const handleClick = () => {
    if (confirming) {
      onSwitch()
    } else {
      setConfirming(true)
    }
  }

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

      <div class="flex items-center justify-between">
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

        {isAdmin && !isActive && (
          <button
            onClick={handleClick}
            disabled={!canSwitch && !confirming}
            class={`text-xs px-2 py-1 rounded transition-all ${
              isSwitching
                ? 'bg-amber-500/20 text-amber-400 cursor-wait'
                : confirming
                ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50 animate-pulse'
                : canSwitch
                ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border border-violet-500/30'
                : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            {isSwitching ? (
              <span class="flex items-center gap-1">
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Switching
              </span>
            ) : confirming ? 'Confirm?' : 'Switch'}
          </button>
        )}
      </div>
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
