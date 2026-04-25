import { MetricGauge } from './MetricsPanel'

const MAX_MBPS = 1000

export function NetworkPanel({ network, isRealtime }) {
  const rx = network?.received_mbps ?? null
  const tx = network?.sent_mbps ?? null

  return (
    <div class="glass-card p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">Network</h2>
        {isRealtime && (
          <span class="text-xs text-emerald-400 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
            Live
          </span>
        )}
      </div>

      <div class="grid grid-cols-2 gap-6">
        <MetricGauge
          label="↓ Download"
          value={rx}
          max={MAX_MBPS}
          thresholds={{ warning: 100, critical: 700 }}
          isRealtime={isRealtime}
        />
        <MetricGauge
          label="↑ Upload"
          value={tx}
          max={MAX_MBPS}
          thresholds={{ warning: 100, critical: 700 }}
          isRealtime={isRealtime}
        />
      </div>

      <p class="text-center text-xs text-white/25 mt-3">Mbps</p>
    </div>
  )
}
