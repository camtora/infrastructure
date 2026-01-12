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

    // Fetch history for each service in parallel
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

  // Group timeline into slots for display
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
        return 'bg-green-500'
      case 'down':
        return 'bg-red-500'
      default:
        return 'bg-gray-600'
    }
  }

  return (
    <div class="bg-gray-800 rounded-lg p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold text-white">Uptime History</h2>
        <div class="flex gap-2">
          <button
            onClick={() => setHours(24)}
            class={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              hours === 24
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            24 hours
          </button>
          <button
            onClick={() => setHours(168)}
            class={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              hours === 168
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            7 days
          </button>
        </div>
      </div>

      {loading ? (
        <div class="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} class="animate-pulse">
              <div class="h-4 bg-gray-700 rounded w-24 mb-1" />
              <div class="h-3 bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div class="space-y-4">
          {services.map((svc) => {
            const svcHistory = history[svc.name]
            const slots = svcHistory ? getSlots(svcHistory.timeline) : []
            const uptime = svcHistory?.uptime_percent

            return (
              <div key={svc.name}>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm text-gray-300">{svc.name}</span>
                  {uptime !== undefined && (
                    <span
                      class={`text-xs font-medium ${
                        uptime >= 99.5
                          ? 'text-green-400'
                          : uptime >= 95
                          ? 'text-yellow-400'
                          : 'text-red-400'
                      }`}
                    >
                      {uptime}%
                    </span>
                  )}
                </div>
                <div class="flex gap-px h-3">
                  {slots.length > 0 ? (
                    slots.map((status, i) => (
                      <div
                        key={i}
                        class={`flex-1 rounded-sm ${getSlotColor(status)}`}
                        title={`${status === 'unknown' ? 'No data' : status}`}
                      />
                    ))
                  ) : (
                    <div class="flex-1 h-3 bg-gray-700 rounded text-xs text-gray-500 flex items-center justify-center">
                      No history yet
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div class="flex justify-between text-xs text-gray-500 mt-4">
        <span>{hours === 24 ? '24 hours' : '7 days'} ago</span>
        <span>now</span>
      </div>

      <div class="flex items-center gap-4 mt-4 pt-4 border-t border-gray-700">
        <div class="flex items-center gap-2 text-xs text-gray-400">
          <span class="w-3 h-3 rounded-sm bg-green-500" />
          <span>Operational</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-400">
          <span class="w-3 h-3 rounded-sm bg-red-500" />
          <span>Down</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-400">
          <span class="w-3 h-3 rounded-sm bg-gray-600" />
          <span>No data</span>
        </div>
      </div>
    </div>
  )
}
