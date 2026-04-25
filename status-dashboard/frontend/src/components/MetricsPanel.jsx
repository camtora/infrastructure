import { Thermometer } from './ThermalsPanel'

const OS_ORDER      = ['/', '/home', '/var', '/tmp']
const STORAGE_ORDER = ['/HOMENAS', '/CAMRAID', '/GAMES']

// ─── CPU Panel ────────────────────────────────────────────────────────────────

export function CpuPanel({ metrics, realtimeMetrics, metricsError, adminAuth, onRebootClick, cpuTemps }) {
  const cpu  = metrics?.cpu
  const load = metrics?.load
  const displayCpu = realtimeMetrics?.cpu?.percent ?? cpu?.percent
  const isRealtime = realtimeMetrics !== null

  const pkg     = cpuTemps?.package
  const cores   = cpuTemps?.cores || []
  const avgTemp = cores.length ? Math.round(cores.reduce((s, c) => s + c.temp, 0) / cores.length) : null
  const high    = cores[0]?.high ?? 82
  const crit    = cores[0]?.crit ?? 100
  const cpuCount = load?.cpu_count || 4

  return (
    <div class="glass-card p-6">
      <div class="relative flex items-center justify-center mb-4">
        <h2 class="text-lg font-medium text-white">CPU</h2>
        <div class="absolute right-0 flex items-center gap-3">
          {isRealtime && !metricsError && (
            <span class="text-xs text-violet-400 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
          {metricsError && <span class="text-xs text-amber-400" title={metricsError}>Using cached data</span>}
          {adminAuth?.is_admin && (
            <button
              onClick={onRebootClick}
              class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all duration-200 text-xs"
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

      <div class="flex items-end justify-around gap-2 mb-1">
        <ArcGauge label="Utilization" value={displayCpu}    max={100}      thresholds={{ warning: 70, critical: 90 }}                  suffix="%" />
        <ArcGauge label="Load 1m"     value={load?.load_1m} max={cpuCount} thresholds={{ warning: cpuCount * 0.7, critical: cpuCount }} decimals={1} />
        <ArcGauge label="Load 5m"     value={load?.load_5m} max={cpuCount} thresholds={{ warning: cpuCount * 0.7, critical: cpuCount }} decimals={1} />
      </div>
      <p class="text-xs text-white/40 text-center mt-3 mb-4">load = # of cores worth of work being done</p>
      {pkg && (
        <div class="flex items-end justify-center gap-4 pt-4 border-t border-white/[0.06]">
          <Thermometer label="Package" temp={pkg.temp} high={pkg.high} crit={pkg.crit} size="md" />
          <div class="w-px self-stretch bg-white/[0.06]" />
          <div class="flex items-end gap-3">
            {cores.map(c => (
              <Thermometer key={c.id} label={`C${c.id}`} temp={c.temp} high={c.high} crit={c.crit} size="xs" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Memory Panel ─────────────────────────────────────────────────────────────

export function MemoryPanel({ metrics, realtimeMetrics, metricsError }) {
  const mem = metrics?.memory || {}
  const isRealtime = realtimeMetrics !== null
  const percent      = realtimeMetrics?.memory?.percent      ?? mem.percent      ?? null
  const usedGb       = realtimeMetrics?.memory?.used_gb      ?? mem.used_gb      ?? null
  const totalGb      = realtimeMetrics?.memory?.total_gb     ?? mem.total_gb     ?? null
  const freeGb       = realtimeMetrics?.memory?.available_gb ?? mem.available_gb ?? null
  const swapPercent  = mem.swap_percent  ?? null
  const swapUsedGb   = mem.swap_used_gb  ?? null
  const swapTotalGb  = mem.swap_total_gb ?? null

  // /dev (RAM) = Plex transcode tmpfs — pulled from disks array
  const diskMap   = Object.fromEntries((metrics?.disks || []).map(d => [d.mount, d]))
  const transcode = diskMap['/dev (RAM)']
  const txPct   = transcode?.percent ?? null
  const txTotal = transcode?.total != null ? transcode.total / 1024 ** 3 : null
  const txUsed  = transcode?.used  != null ? transcode.used  / 1024 ** 3 : (txTotal != null ? 0 : null)

  return (
    <div class="glass-card p-6">
      <div class="relative flex items-center justify-center mb-4">
        <h2 class="text-lg font-medium text-white">Memory</h2>
        {isRealtime && !metricsError && (
          <span class="absolute right-0 text-xs text-violet-400 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>

      <div class="grid grid-cols-2 mb-4">
        <div class="flex flex-col items-center">
          <ArcGauge label="RAM" value={percent} max={100} thresholds={{ warning: 70, critical: 90 }} suffix="%" />
          {usedGb != null && totalGb != null && (
            <p class="mt-3 text-xs text-white/40 tabular-nums text-center">{usedGb.toFixed(1)} / {totalGb.toFixed(1)} GB</p>
          )}
        </div>
        <div class="flex flex-col items-center">
          <ArcGauge label="Swap" value={swapPercent} max={100} thresholds={{ warning: 50, critical: 80 }} suffix="%" />
          {swapUsedGb != null && swapTotalGb != null && (
            <p class="mt-3 text-xs text-white/40 tabular-nums text-center">{swapUsedGb.toFixed(1)} / {swapTotalGb.toFixed(1)} GB</p>
          )}
        </div>
      </div>
      <div class="pt-4 border-t border-white/[0.06]">
        <h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 text-center">Dedicated RAM</h3>
        <div class="grid grid-cols-2 w-full">
          <div class="flex flex-col items-center">
            <ArcGauge label="Plex Transcode" value={txPct} max={100} thresholds={{ warning: 60, critical: 85 }} suffix="%" />
            {txUsed != null && txTotal != null && (
              <p class="mt-3 text-xs text-white/40 tabular-nums text-center">{txUsed.toFixed(1)} / {txTotal.toFixed(1)} GB</p>
            )}
          </div>
          {/* TODO: Minecraft RAM is fake/placeholder — wire up real data when Minecraft server is running */}
          <div class="flex flex-col items-center">
            <ArcGauge label="Minecraft" value={0} max={100} thresholds={{ warning: 60, critical: 85 }} suffix="%" />
            <p class="mt-3 text-xs text-white/40 tabular-nums text-center">0.0 / 4.0 GB</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatRow({ label, value }) {
  return (
    <div class="flex justify-between text-xs">
      <span class="text-white/40">{label}</span>
      <span class="text-white/70 tabular-nums font-mono">{value}</span>
    </div>
  )
}

// ─── Disk I/O Panel ───────────────────────────────────────────────────────────

const IO_DEVICES = [
  { key: 'sda', label: 'System',         thresholds: {}, neutral: true },
  { key: 'sdb', label: 'Games',          thresholds: {}, neutral: true },
  { key: 'md1', label: 'Plex Media',     thresholds: { warning: 60, critical: 85 } },
  { key: 'sdk', label: 'Personal Media', thresholds: { warning: 60, critical: 85 } },
]

export function DiskIOPanel({ diskUtil, isRealtime }) {
  return (
    <div class="glass-card p-6">
      <div class="relative flex items-center justify-center mb-4">
        <h2 class="text-lg font-medium text-white">Disk I/O</h2>
        {isRealtime && (
          <span class="absolute right-0 text-xs text-violet-400 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>
      <h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 text-center">Drives</h3>
      <div class="grid grid-cols-2">
        {IO_DEVICES.slice(0, 2).map(({ key, label }) => (
          <ArcGauge key={key} label={label} value={diskUtil?.[key] ?? null} max={100} thresholds={{}} accent="purple" suffix="%" />
        ))}
      </div>
      <p class="text-xs text-white/30 text-center mt-2 mb-4 pb-4 border-b border-white/[0.06]">% of time each drive was actively reading or writing</p>
      <h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 text-center">Storage Arrays</h3>
      <div class="grid grid-cols-2">
        {IO_DEVICES.slice(2).map(({ key, label, thresholds }) => (
          <ArcGauge key={key} label={label} value={diskUtil?.[key] ?? null} max={100} thresholds={thresholds} suffix="%" />
        ))}
      </div>
      <p class="text-xs text-white/30 text-center mt-2">Amber above 60% · Red above 85%</p>
    </div>
  )
}

// ─── Disk Usage Panel ─────────────────────────────────────────────────────────

export function DiskUsagePanel({ disks }) {
  const diskMap      = Object.fromEntries((disks || []).map(d => [d.mount, d]))
  const osDisks      = OS_ORDER.map(m => diskMap[m]).filter(Boolean)
  const storageDisks = STORAGE_ORDER.map(m => diskMap[m]).filter(Boolean)

  if (!osDisks.length && !storageDisks.length) return null

  return (
    <div class="glass-card p-6">
      <h2 class="text-lg font-medium text-white mb-4 text-center">Disk Usage</h2>
      <div>
        {osDisks.length > 0 && (
          <div class="mb-3">
            <h3 class="text-xs font-medium text-white/30 uppercase tracking-wider mb-2">OS Drive</h3>
            <div class="space-y-2.5">
              {osDisks.map(disk => <DiskBar key={disk.mount} disk={disk} />)}
            </div>
          </div>
        )}
        {storageDisks.length > 0 && (
          <div>
            <h3 class="text-xs font-medium text-white/30 uppercase tracking-wider mb-2">Storage</h3>
            <div class="space-y-2.5">
              {storageDisks.map(disk => <DiskBar key={disk.mount} disk={disk} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────

export function ArcGauge({ label, value, max = 100, thresholds = {}, decimals = 0, suffix = '', neutral = false, inverted = false, accent = 'emerald' }) {
  const displayValue = value !== null && value !== undefined ? value : null
  const percent = displayValue !== null ? Math.min(Math.max((displayValue / max) * 100, 0), 100) : 0

  const defaultColor = accent === 'purple' ? ['text-violet-400', '#a78bfa'] : ['text-white/70', 'rgba(255,255,255,0.5)']
  let color = defaultColor[0], stroke = defaultColor[1]
  if (neutral) {
    color = 'text-white/70'; stroke = 'rgba(255,255,255,0.4)'
  } else if (displayValue !== null) {
    if (inverted) {
      if (thresholds.critical && displayValue <= thresholds.critical)    { color = 'text-red-400';   stroke = '#f87171' }
      else if (thresholds.warning && displayValue <= thresholds.warning) { color = 'text-amber-400'; stroke = '#fbbf24' }
    } else {
      if (thresholds.critical && displayValue >= thresholds.critical)    { color = 'text-red-400';   stroke = '#f87171' }
      else if (thresholds.warning && displayValue >= thresholds.warning) { color = 'text-amber-400'; stroke = '#fbbf24' }
    }
  }

  const r = 28, cx = 32, cy = 34
  const arcLen = Math.PI * r
  const dashOffset = arcLen * (1 - percent / 100)
  const displayStr = displayValue !== null
    ? (decimals > 0 ? displayValue.toFixed(decimals) : Math.round(displayValue)) + suffix
    : '—'

  return (
    <div class="text-center">
      <div class="relative w-16 mx-auto mb-2" style={{ height: '42px' }}>
        <svg width="64" height="42" viewBox="0 0 64 42">
          <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
            fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3" stroke-linecap="round" />
          <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
            fill="none" stroke={stroke} stroke-width="3" stroke-linecap="round"
            stroke-dasharray={arcLen} stroke-dashoffset={dashOffset}
            style="transition: stroke-dashoffset 0.5s ease, stroke 0.5s ease" />
        </svg>
        <div class="absolute inset-0 flex items-end justify-center" style={{ paddingBottom: '2px' }}>
          <span class={`text-sm font-semibold tabular-nums ${color}`}>{displayStr}</span>
        </div>
      </div>
      <p class="text-xs text-white/50">{label}</p>
    </div>
  )
}

export function MetricGauge({ label, value, max = 100, thresholds = {}, isRealtime = false }) {
  const displayValue = value !== null && value !== undefined ? value : null
  const percent = displayValue !== null ? Math.min((displayValue / max) * 100, 100) : 0

  let color = 'text-emerald-400', strokeColor = 'stroke-emerald-400'
  if (displayValue !== null) {
    if (thresholds.critical && displayValue >= thresholds.critical)       { color = 'text-red-400';   strokeColor = 'stroke-red-400' }
    else if (thresholds.warning && displayValue >= thresholds.warning)    { color = 'text-amber-400'; strokeColor = 'stroke-amber-400' }
  }

  const transitionClass  = isRealtime ? 'transition-all duration-300' : 'transition-all duration-500'
  const circumference    = 2 * Math.PI * 28
  const strokeDashoffset = circumference - (percent / 100) * circumference

  return (
    <div class="text-center">
      <div class="relative w-16 h-16 mx-auto mb-2">
        <svg class="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="3" fill="transparent" class="text-white/[0.06]" />
          <circle cx="32" cy="32" r="28" stroke-width="3" fill="transparent" stroke-linecap="round"
            class={`${strokeColor} ${transitionClass}`}
            style={{ strokeDasharray: circumference, strokeDashoffset }}
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
  const freeGb  = disk.free  != null ? disk.free  / (1024 ** 3) : null
  const totalGb = disk.total != null ? disk.total / (1024 ** 3) : null
  const isLarge = totalGb != null && totalGb > 5120 // > 5 TB — use free-space thresholds

  let barColor = 'bg-white/50', textColor = 'text-white/60'
  if (isLarge && freeGb != null) {
    if (freeGb <= 1024)      { barColor = 'bg-red-400';   textColor = 'text-red-400' }
    else if (freeGb <= 2048) { barColor = 'bg-amber-400'; textColor = 'text-amber-400' }
  } else {
    if (percent >= 90)      { barColor = 'bg-red-400';   textColor = 'text-red-400' }
    else if (percent >= 70) { barColor = 'bg-amber-400'; textColor = 'text-amber-400' }
  }

  const fmt = (bytes) => {
    if (!bytes) return '0 GB'
    const gb = bytes / (1024 ** 3)
    return gb >= 1000 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(1)} GB`
  }

  return (
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-white/70 font-medium">{disk.mount}</span>
        <span class="text-white/40 tabular-nums">
          {fmt(disk.used)} / {fmt(disk.total)}
          <span class={`ml-2 ${textColor}`}>{percent}%</span>
        </span>
      </div>
      <div class="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div class={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
