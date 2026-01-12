export function SpeedPanel({ speedTest }) {
  if (!speedTest || speedTest.error) {
    return (
      <div class="bg-gray-800 rounded-lg p-6 h-full">
        <h2 class="text-xl font-semibold text-white mb-4">Speed Test</h2>
        <p class="text-gray-400">
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
    <div class="bg-gray-800 rounded-lg p-6 h-full">
      <h2 class="text-xl font-semibold text-white mb-4">Speed Test</h2>

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
            <h3 class="text-sm font-medium text-gray-400 mb-3">VPN Locations</h3>
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
          <p class="text-xs text-gray-500 text-center">
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
    healthy: { color: 'bg-green-500', label: 'Healthy' },
    unhealthy: { color: 'bg-red-500', label: 'Unhealthy' },
    error: { color: 'bg-yellow-500', label: 'Error' },
    stopped: { color: 'bg-gray-500', label: 'Stopped' },
    unknown: { color: 'bg-gray-500', label: 'Unknown' }
  }

  const { color, label } = statusConfig[status] || statusConfig.unknown

  return (
    <div class={`rounded-lg p-3 ${isActive ? 'bg-blue-900/30 border border-blue-500/50' : 'bg-gray-700/50'}`}>
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class={`w-2 h-2 rounded-full ${color}`}></span>
          <span class="text-white font-medium">{location}</span>
          {isActive && (
            <span class="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">Active</span>
          )}
        </div>
        <span class={`text-xs ${status === 'healthy' ? 'text-green-400' : 'text-gray-400'}`}>
          {label}
        </span>
      </div>

      {status === 'healthy' && data?.download ? (
        <div class="flex items-center gap-4 text-sm">
          <div class="flex items-center gap-1 text-gray-300">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span>{data.download.toFixed(1)} Mbps</span>
          </div>
          {data.upload && (
            <div class="flex items-center gap-1 text-gray-300">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span>{data.upload.toFixed(1)} Mbps</span>
            </div>
          )}
        </div>
      ) : (
        <p class="text-xs text-gray-500">
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
      <h3 class="text-sm font-medium text-gray-400 mb-2">{title}</h3>
      <div class="grid grid-cols-3 gap-2">
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
    <div class="bg-gray-700/50 rounded-lg p-3 text-center">
      <div class="text-gray-400 mb-1 flex justify-center">{icon}</div>
      <p class="text-lg font-bold text-white">
        {typeof displayValue === 'number' ? displayValue.toFixed(1) : displayValue}
      </p>
      <p class="text-xs text-gray-400">{unit}</p>
    </div>
  )
}
