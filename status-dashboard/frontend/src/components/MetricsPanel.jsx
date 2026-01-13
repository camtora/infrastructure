export function MetricsPanel({ metrics, realtimeMetrics, metricsError, adminAuth, onRebootClick }) {
  if (!metrics) {
    return (
      <div class="glass-card p-6 h-full">
        <h2 class="text-lg font-medium text-white mb-4">System Metrics</h2>
        <p class="text-white/40 text-sm">Metrics unavailable</p>
      </div>
    )
  }

  const { cpu, memory, load, disks } = metrics

  // Use real-time values if available, fall back to health-api values
  const displayCpu = realtimeMetrics?.cpu?.percent ?? cpu?.percent
  const displayMemory = realtimeMetrics?.memory?.percent ?? memory?.percent
  const isRealtime = realtimeMetrics !== null

  return (
    <div class="glass-card p-6 h-full">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">System Metrics</h2>
        <div class="flex items-center gap-3">
          {isRealtime && !metricsError && (
            <span class="text-xs text-emerald-400 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
              Live
            </span>
          )}
          {metricsError && (
            <span class="text-xs text-amber-400" title={metricsError}>
              Using cached data
            </span>
          )}
          {adminAuth?.is_admin && (
            <button
              onClick={onRebootClick}
              class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10
                     hover:bg-red-500/20 text-red-400 hover:text-red-300
                     transition-all duration-200 text-xs"
              title="Restart Server"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Restart
            </button>
          )}
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
        <MetricGauge
          label="CPU"
          value={displayCpu}
          unit="%"
          thresholds={{ warning: 70, critical: 90 }}
          isRealtime={isRealtime && !metricsError}
        />
        <MetricGauge
          label="Memory"
          value={displayMemory}
          unit="%"
          thresholds={{ warning: 70, critical: 90 }}
          isRealtime={isRealtime && !metricsError}
        />
        <MetricGauge
          label="Load (1m)"
          value={load?.load_1m}
          max={load?.cpu_count || 4}
          thresholds={{ warning: load?.cpu_count * 0.7, critical: load?.cpu_count }}
        />
        <MetricGauge
          label="Load (5m)"
          value={load?.load_5m}
          max={load?.cpu_count || 4}
          thresholds={{ warning: load?.cpu_count * 0.7, critical: load?.cpu_count }}
        />
      </div>

      {disks && disks.length > 0 && (
        <div>
          <h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-4">Disk Usage</h3>
          <div class="space-y-4">
            {disks.map(disk => (
              <DiskBar key={disk.mount} disk={disk} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricGauge({ label, value, unit = '', max = 100, thresholds = {}, isRealtime = false }) {
  const displayValue = value !== null && value !== undefined ? value : null
  const percent = displayValue !== null ? Math.min((displayValue / max) * 100, 100) : 0

  let color = 'text-emerald-400'
  let strokeColor = 'stroke-emerald-400'
  if (displayValue !== null) {
    if (thresholds.critical && displayValue >= thresholds.critical) {
      color = 'text-red-400'
      strokeColor = 'stroke-red-400'
    } else if (thresholds.warning && displayValue >= thresholds.warning) {
      color = 'text-amber-400'
      strokeColor = 'stroke-amber-400'
    }
  }

  // Faster transition for real-time updates
  const transitionClass = isRealtime ? 'transition-all duration-300' : 'transition-all duration-500'

  const circumference = 2 * Math.PI * 28
  const strokeDashoffset = circumference - (percent / 100) * circumference

  return (
    <div class="text-center">
      <div class="relative w-16 h-16 mx-auto mb-3">
        <svg class="w-16 h-16 transform -rotate-90">
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="currentColor"
            stroke-width="3"
            fill="transparent"
            class="text-white/[0.06]"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke-width="3"
            fill="transparent"
            stroke-linecap="round"
            class={`${strokeColor} ${transitionClass}`}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset
            }}
          />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class={`text-sm font-semibold ${color} tabular-nums`}>
            {displayValue !== null ? Math.round(displayValue) : '—'}
          </span>
        </div>
      </div>
      <p class="text-xs text-white/50">{label}</p>
    </div>
  )
}

function DiskBar({ disk }) {
  const percent = disk.percent || 0
  let barColor = 'bg-emerald-400'
  let textColor = 'text-emerald-400'
  if (percent >= 90) {
    barColor = 'bg-red-400'
    textColor = 'text-red-400'
  } else if (percent >= 70) {
    barColor = 'bg-amber-400'
    textColor = 'text-amber-400'
  }

  const formatSize = (bytes) => {
    if (!bytes) return '0 GB'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1000) {
      return `${(gb / 1024).toFixed(1)} TB`
    }
    return `${gb.toFixed(1)} GB`
  }

  return (
    <div>
      <div class="flex justify-between text-xs mb-2">
        <span class="text-white/70 font-medium">{disk.mount}</span>
        <span class="text-white/40 tabular-nums">
          {formatSize(disk.used)} / {formatSize(disk.total)}
          <span class={`ml-2 ${textColor}`}>{percent}%</span>
        </span>
      </div>
      <div class="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          class={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${percent}%` }}
        ></div>
      </div>
    </div>
  )
}
