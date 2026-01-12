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

        {vpn && typeof vpn === 'object' && Object.keys(vpn).length > 0 && (
          Object.entries(vpn).map(([location, data]) => (
            data && data.download && (
              <SpeedSection
                key={location}
                title={`VPN ${location}`}
                download={data.download}
                upload={data.upload}
                ping={data.ping}
              />
            )
          ))
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
