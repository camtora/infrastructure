import { useState } from 'preact/hooks'

export function StoragePanel({ storage }) {
  if (!storage?.arrays?.length) return null

  const overallHealthy = storage.status === 'healthy'
  const statusLabel = storage.status === 'warning' ? 'Warning' : storage.status.toUpperCase()

  return (
    <div class="glass-card p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium text-white">Storage Arrays</h2>
        <span class={`text-xs px-2 py-1 rounded-full ${
          overallHealthy
            ? 'bg-emerald-500/20 text-emerald-400'
            : storage.status === 'warning'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-red-500/20 text-red-400'
        }`}>
          {overallHealthy ? 'All Healthy' : statusLabel}
        </span>
      </div>

      <div class="space-y-4">
        {storage.arrays.map(array => (
          <ArrayCard key={array.name} array={array} drives={storage.drives || []} />
        ))}
      </div>
    </div>
  )
}

function ArrayCard({ array, drives }) {
  const [showDrives, setShowDrives] = useState(false)

  const statusColors = {
    healthy: { bg: 'bg-emerald-400', text: 'text-emerald-400' },
    warning: { bg: 'bg-amber-400', text: 'text-amber-400' },
    degraded: { bg: 'bg-amber-400', text: 'text-amber-400' },
    rebuilding: { bg: 'bg-amber-400', text: 'text-amber-400' },
    failed: { bg: 'bg-red-400', text: 'text-red-400' },
    unmounted: { bg: 'bg-red-400', text: 'text-red-400' },
    unknown: { bg: 'bg-white/20', text: 'text-white/40' }
  }

  const colors = statusColors[array.status] || statusColors.unknown
  const isCritical = array.name === 'HOMENAS' && array.status !== 'healthy'

  // For software RAID, show the individual drives
  const arrayDrives = array.type === 'raid5' ? drives : []
  const drivesWithWarnings = arrayDrives.filter(d => d.warnings?.length > 0)
  const allDrivesHealthy = arrayDrives.length > 0 && arrayDrives.every(d => d.smart_status === 'PASSED' && !d.warnings?.length)

  return (
    <div class={`p-4 rounded-lg bg-white/5 ${isCritical ? 'ring-2 ring-red-500/50' : ''}`}>
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <span class={`w-2.5 h-2.5 rounded-full ${colors.bg}`}></span>
          <div>
            <span class="text-white font-medium">{array.name}</span>
            <span class="text-white/40 text-xs ml-2">/{array.device}</span>
          </div>
        </div>
        <div class="text-right">
          <span class={`text-sm font-medium ${colors.text}`}>
            {array.status === 'rebuilding'
              ? `Rebuilding ${array.rebuild_progress}%`
              : array.status.charAt(0).toUpperCase() + array.status.slice(1)}
          </span>
          {array.sync_status && (
            <span class="text-xs text-white/30 ml-2 font-mono">{array.sync_status}</span>
          )}
        </div>
      </div>

      {/* RAID details for software RAID */}
      {array.type === 'raid5' && (
        <div class="flex items-center gap-4 text-xs text-white/50 mb-3">
          <span>RAID5</span>
          <span>{array.active_devices}/{array.total_devices} drives</span>
          <span class={array.mounted ? 'text-emerald-400' : 'text-red-400'}>
            {array.mounted ? 'Mounted' : 'Not Mounted'}
          </span>
        </div>
      )}

      {/* Hardware RAID - just show mount status */}
      {array.type === 'hardware_raid' && (
        <div class="flex items-center gap-4 text-xs text-white/50 mb-3">
          <span>Hardware RAID</span>
          <span class={array.mounted ? 'text-emerald-400' : 'text-red-400'}>
            {array.mounted ? 'Mounted' : 'Not Mounted'}
          </span>
        </div>
      )}

      {/* Usage bar */}
      {array.usage_percent !== undefined && (
        <div>
          <div class="flex justify-between text-xs mb-1">
            <span class="text-white/40">{array.mount_point}</span>
            <span class={array.usage_percent >= 90 ? 'text-red-400' : 'text-white/50'}>
              {array.usage_percent}% used
            </span>
          </div>
          <div class="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              class={`h-full rounded-full transition-all duration-500 ${
                array.usage_percent >= 90 ? 'bg-red-400' :
                array.usage_percent >= 70 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${array.usage_percent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Drive health section for software RAID */}
      {array.type === 'raid5' && arrayDrives.length > 0 && (
        <div class="mt-3 pt-3 border-t border-white/10">
          <button
            onClick={() => setShowDrives(!showDrives)}
            class="flex items-center justify-between w-full text-xs hover:text-white/70 transition-colors"
          >
            <span class={drivesWithWarnings.length > 0 ? 'text-amber-400' : 'text-white/50'}>
              {drivesWithWarnings.length > 0
                ? `${drivesWithWarnings.length} drive warning(s)`
                : allDrivesHealthy
                  ? `${arrayDrives.length} drives healthy`
                  : `${arrayDrives.length} drives`
              }
            </span>
            <span class="text-white/30">{showDrives ? '\u25B2' : '\u25BC'}</span>
          </button>

          {showDrives && (
            <div class="mt-2 space-y-1">
              {arrayDrives.map(drive => (
                <DriveRow key={drive.device} drive={drive} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Critical warning for HOMENAS */}
      {isCritical && (
        <div class="mt-3 p-2 rounded bg-red-500/10 border border-red-500/30">
          <p class="text-xs text-red-300">
            Critical: Plex media array is {array.status}. Services may be affected.
          </p>
        </div>
      )}
    </div>
  )
}

function DriveRow({ drive }) {
  const hasWarning = drive.warnings?.length > 0
  const statusColor = drive.smart_status === 'PASSED'
    ? 'bg-emerald-400'
    : drive.smart_status === 'FAILED'
      ? 'bg-red-400'
      : 'bg-white/30'

  return (
    <div class={`flex items-center justify-between py-1.5 px-2 rounded text-xs ${
      hasWarning ? 'bg-amber-500/10' : 'bg-white/5'
    }`}>
      <div class="flex items-center gap-2">
        <span class={`w-1.5 h-1.5 rounded-full ${statusColor}`}></span>
        <span class="text-white/70 font-mono">/dev/{drive.device}</span>
        {drive.model && (
          <span class="text-white/30 hidden sm:inline truncate max-w-[150px]" title={drive.model}>
            {drive.model}
          </span>
        )}
      </div>
      <div class="flex items-center gap-3 text-white/50">
        {drive.temperature !== undefined && (
          <span class={drive.temperature > 50 ? 'text-amber-400' : ''}>
            {drive.temperature}°C
          </span>
        )}
        <span class={
          drive.smart_status === 'PASSED' ? 'text-emerald-400' :
          drive.smart_status === 'FAILED' ? 'text-red-400' : ''
        }>
          {drive.smart_status || '?'}
        </span>
      </div>
    </div>
  )
}
