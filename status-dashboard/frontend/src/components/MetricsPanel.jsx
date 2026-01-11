export function MetricsPanel({ metrics }) {
  if (!metrics) {
    return (
      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-xl font-semibold text-white mb-4">System Metrics</h2>
        <p class="text-gray-400">Metrics unavailable</p>
      </div>
    )
  }

  const { cpu, memory, load, disks } = metrics

  return (
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-xl font-semibold text-white mb-4">System Metrics</h2>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricGauge
          label="CPU"
          value={cpu?.percent}
          unit="%"
          thresholds={{ warning: 70, critical: 90 }}
        />
        <MetricGauge
          label="Memory"
          value={memory?.percent}
          unit="%"
          thresholds={{ warning: 70, critical: 90 }}
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
          <h3 class="text-sm font-medium text-gray-400 mb-3">Disk Usage</h3>
          <div class="space-y-3">
            {disks.map(disk => (
              <DiskBar key={disk.mount} disk={disk} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricGauge({ label, value, unit = '', max = 100, thresholds = {} }) {
  const displayValue = value !== null && value !== undefined ? value : null
  const percent = displayValue !== null ? Math.min((displayValue / max) * 100, 100) : 0

  let color = 'text-green-400'
  let bgColor = 'bg-green-500'
  if (displayValue !== null) {
    if (thresholds.critical && displayValue >= thresholds.critical) {
      color = 'text-red-400'
      bgColor = 'bg-red-500'
    } else if (thresholds.warning && displayValue >= thresholds.warning) {
      color = 'text-yellow-400'
      bgColor = 'bg-yellow-500'
    }
  }

  return (
    <div class="text-center">
      <div class="relative w-16 h-16 mx-auto mb-2">
        <svg class="w-16 h-16 transform -rotate-90">
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="currentColor"
            stroke-width="4"
            fill="transparent"
            class="text-gray-700"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="currentColor"
            stroke-width="4"
            fill="transparent"
            stroke-dasharray={`${percent * 1.76} 176`}
            class={bgColor}
          />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class={`text-sm font-bold ${color}`}>
            {displayValue !== null ? Math.round(displayValue) : '—'}
          </span>
        </div>
      </div>
      <p class="text-xs text-gray-400">{label}</p>
    </div>
  )
}

function DiskBar({ disk }) {
  const percent = disk.percent || 0
  let barColor = 'bg-green-500'
  if (percent >= 90) {
    barColor = 'bg-red-500'
  } else if (percent >= 70) {
    barColor = 'bg-yellow-500'
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
      <div class="flex justify-between text-xs mb-1">
        <span class="text-gray-300 font-medium">{disk.mount}</span>
        <span class="text-gray-400">
          {formatSize(disk.used)} / {formatSize(disk.total)} ({percent}%)
        </span>
      </div>
      <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          class={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${percent}%` }}
        ></div>
      </div>
    </div>
  )
}
