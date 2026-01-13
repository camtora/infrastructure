export function StoragePanel({ storage }) {
  if (!storage?.arrays?.length) return null

  const overallHealthy = storage.status === 'healthy'

  return (
    <div class="glass-card p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium text-white">Storage Arrays</h2>
        <span class={`text-xs px-2 py-1 rounded-full ${
          overallHealthy
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-red-500/20 text-red-400'
        }`}>
          {overallHealthy ? 'All Healthy' : storage.status.toUpperCase()}
        </span>
      </div>

      <div class="space-y-4">
        {storage.arrays.map(array => (
          <ArrayCard key={array.name} array={array} />
        ))}
      </div>
    </div>
  )
}

function ArrayCard({ array }) {
  const statusColors = {
    healthy: { bg: 'bg-emerald-400', text: 'text-emerald-400' },
    degraded: { bg: 'bg-amber-400', text: 'text-amber-400' },
    rebuilding: { bg: 'bg-amber-400', text: 'text-amber-400' },
    failed: { bg: 'bg-red-400', text: 'text-red-400' },
    unmounted: { bg: 'bg-red-400', text: 'text-red-400' },
    unknown: { bg: 'bg-white/20', text: 'text-white/40' }
  }

  const colors = statusColors[array.status] || statusColors.unknown
  const isCritical = array.name === 'HOMENAS' && array.status !== 'healthy'

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
