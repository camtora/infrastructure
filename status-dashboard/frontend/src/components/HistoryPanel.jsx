import { useState, useEffect } from 'preact/hooks'

/**
 * HistoryPanel - Shows uptime history for all services
 */
export function HistoryPanel({ services }) {
  const [hours, setHours] = useState(24)
  const [history, setHistory] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAllHistory()
  }, [hours, services])

  const fetchAllHistory = async () => {
    if (!services || services.length === 0) return

    setLoading(true)
    const results = {}

    await Promise.all(
      services.map(async (svc) => {
        try {
          const resp = await fetch(
            `/api/history?service=${encodeURIComponent(svc.name)}&hours=${hours}`
          )
          if (resp.ok) {
            results[svc.name] = await resp.json()
          }
        } catch (e) {
          // Ignore individual failures
        }
      })
    )

    setHistory(results)
    setLoading(false)
  }

  const getSlots = (timeline) => {
    if (!timeline || timeline.length === 0) return []

    const now = new Date()
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000)
    const barCount = hours <= 24 ? 48 : 84
    const slotDuration = (hours * 60 * 60 * 1000) / barCount

    const slots = []

    for (let i = 0; i < barCount; i++) {
      const slotStart = new Date(startTime.getTime() + i * slotDuration)
      const slotEnd = new Date(slotStart.getTime() + slotDuration)

      const eventsInSlot = timeline.filter((e) => {
        const eventTime = new Date(e.time)
        return eventTime >= slotStart && eventTime < slotEnd
      })

      if (eventsInSlot.length === 0) {
        slots.push('unknown')
      } else {
        const hasDown = eventsInSlot.some((e) => e.status === 'down')
        slots.push(hasDown ? 'down' : 'up')
      }
    }

    return slots
  }

  const getSlotColor = (status) => {
    switch (status) {
      case 'up':
        return 'bg-emerald-400'
      case 'down':
        return 'bg-red-400'
      default:
        return 'bg-white/10'
    }
  }

  return (
    <div class="glass-card p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-medium text-white">Uptime History</h2>
        <div class="flex gap-2">
          <button
            onClick={() => setHours(24)}
            class={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              hours === 24
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black'
                : 'bg-white/[0.05] border border-white/[0.1] text-white/70 hover:bg-white/[0.1]'
            }`}
          >
            24 hours
          </button>
          <button
            onClick={() => setHours(168)}
            class={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              hours === 168
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black'
                : 'bg-white/[0.05] border border-white/[0.1] text-white/70 hover:bg-white/[0.1]'
            }`}
          >
            7 days
          </button>
        </div>
      </div>

      {loading ? (
        <div class="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} class="animate-pulse">
              <div class="h-4 bg-white/[0.06] rounded w-28 mb-2" />
              <div class="h-2 bg-white/[0.06] rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div class="space-y-5">
          {services.map((svc) => {
            const svcHistory = history[svc.name]
            const slots = svcHistory ? getSlots(svcHistory.timeline) : []
            const uptime = svcHistory?.uptime_percent

            return (
              <div key={svc.name}>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-white/70">{svc.name}</span>
                  {uptime !== undefined && (
                    <span
                      class={`text-xs font-medium tabular-nums ${
                        uptime >= 99.5
                          ? 'text-emerald-400'
                          : uptime >= 95
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                    >
                      {uptime}%
                    </span>
                  )}
                </div>
                <div class="flex gap-px h-2">
                  {slots.length > 0 ? (
                    slots.map((status, i) => (
                      <div
                        key={i}
                        class={`flex-1 rounded-[2px] ${getSlotColor(status)} transition-colors`}
                        title={`${status === 'unknown' ? 'No data' : status}`}
                      />
                    ))
                  ) : (
                    <div class="flex-1 h-2 bg-white/[0.06] rounded text-[10px] text-white/30 flex items-center justify-center">
                      No history yet
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div class="flex justify-between text-xs text-white/30 mt-5">
        <span>{hours === 24 ? '24 hours' : '7 days'} ago</span>
        <span>now</span>
      </div>

      <div class="flex items-center gap-6 mt-5 pt-5 border-t border-white/[0.06]">
        <div class="flex items-center gap-2 text-xs text-white/50">
          <span class="w-3 h-2 rounded-sm bg-emerald-400" />
          <span>Operational</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-white/50">
          <span class="w-3 h-2 rounded-sm bg-red-400" />
          <span>Down</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-white/50">
          <span class="w-3 h-2 rounded-sm bg-white/10" />
          <span>No data</span>
        </div>
      </div>
    </div>
  )
}
