import { useState, useEffect } from 'preact/hooks'

/**
 * UptimeBar - Shows historical uptime as colored bars
 *
 * Each bar represents a time slot (5 min for 24h view, 30 min for 7d view)
 * Colors: green = up, red = down, orange = degraded, gray = no data
 */
export function UptimeBar({ serviceName, hours = 24 }) {
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchHistory()
  }, [serviceName, hours])

  const fetchHistory = async () => {
    try {
      setLoading(true)
      const resp = await fetch(`/api/history?service=${encodeURIComponent(serviceName)}&hours=${hours}`)
      if (!resp.ok) throw new Error('Failed to fetch history')
      const data = await resp.json()
      setHistory(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div class="h-2 bg-gray-700 rounded animate-pulse" />
  }

  if (error || !history) {
    return <div class="h-2 bg-gray-700 rounded" title="No history available" />
  }

  const timeline = history.timeline || []

  // For display, we want a fixed number of bars
  // 24h = 48 bars (30 min each), 7d = 84 bars (2 hours each)
  const barCount = hours <= 24 ? 48 : 84
  const slotMinutes = hours <= 24 ? 30 : 120 // 30 min or 2 hour slots

  // Group timeline into slots
  const slots = groupIntoSlots(timeline, hours, barCount, slotMinutes)

  return (
    <div class="space-y-1">
      <div class="flex gap-px h-2">
        {slots.map((slot, i) => (
          <div
            key={i}
            class={`flex-1 rounded-sm ${getSlotColor(slot)} transition-colors hover:opacity-80`}
            title={getSlotTooltip(slot, i, barCount, hours)}
          />
        ))}
      </div>
      <div class="flex justify-between text-xs text-gray-500">
        <span>{hours}h ago</span>
        <span class="text-green-400">{history.uptime_percent}% uptime</span>
        <span>now</span>
      </div>
    </div>
  )
}

/**
 * Group timeline events into fixed-size slots for display
 */
function groupIntoSlots(timeline, hours, barCount, slotMinutes) {
  const now = new Date()
  const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000)
  const slotDuration = slotMinutes * 60 * 1000 // in ms

  const slots = []

  for (let i = 0; i < barCount; i++) {
    const slotStart = new Date(startTime.getTime() + i * slotDuration)
    const slotEnd = new Date(slotStart.getTime() + slotDuration)

    // Find events in this slot
    const eventsInSlot = timeline.filter(e => {
      const eventTime = new Date(e.time)
      return eventTime >= slotStart && eventTime < slotEnd
    })

    if (eventsInSlot.length === 0) {
      slots.push({ status: 'unknown', events: [] })
    } else {
      // Determine slot status (any down = down, any degraded = degraded, else up)
      const hasDown = eventsInSlot.some(e => e.status === 'down')
      const hasDegraded = eventsInSlot.some(e => e.status === 'degraded')

      slots.push({
        status: hasDown ? 'down' : hasDegraded ? 'degraded' : 'up',
        events: eventsInSlot,
        avgResponseTime: calcAvgResponseTime(eventsInSlot),
      })
    }
  }

  return slots
}

function calcAvgResponseTime(events) {
  const times = events
    .map(e => e.response_time_ms)
    .filter(t => t !== null && t !== undefined)

  if (times.length === 0) return null
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length)
}

function getSlotColor(slot) {
  switch (slot.status) {
    case 'up':
      return 'bg-green-500'
    case 'down':
      return 'bg-red-500'
    case 'degraded':
      return 'bg-yellow-500'
    default:
      return 'bg-gray-600'
  }
}

function getSlotTooltip(slot, index, total, hours) {
  const now = new Date()
  const slotDuration = (hours * 60) / total // minutes per slot
  const minutesAgo = Math.round((total - index - 1) * slotDuration)

  let timeLabel
  if (minutesAgo < 60) {
    timeLabel = `${minutesAgo}m ago`
  } else if (minutesAgo < 24 * 60) {
    timeLabel = `${Math.round(minutesAgo / 60)}h ago`
  } else {
    timeLabel = `${Math.round(minutesAgo / (24 * 60))}d ago`
  }

  const statusLabel = slot.status === 'unknown' ? 'No data' : slot.status.toUpperCase()
  const responseTime = slot.avgResponseTime ? ` (${slot.avgResponseTime}ms)` : ''

  return `${timeLabel}: ${statusLabel}${responseTime}`
}


/**
 * Compact uptime summary for service cards
 */
export function UptimeSummary({ serviceName, hours = 24 }) {
  const [uptime, setUptime] = useState(null)

  useEffect(() => {
    fetch(`/api/history?service=${encodeURIComponent(serviceName)}&hours=${hours}`)
      .then(r => r.ok ? r.json() : null)
      .then(setUptime)
      .catch(() => setUptime(null))
  }, [serviceName, hours])

  if (!uptime || uptime.total_checks === 0) {
    return null
  }

  const pct = uptime.uptime_percent
  const color = pct >= 99.5 ? 'text-green-400' : pct >= 95 ? 'text-yellow-400' : 'text-red-400'

  return (
    <span class={`text-xs ${color}`} title={`${uptime.up_count}/${uptime.total_checks} checks passed`}>
      {pct}% uptime
    </span>
  )
}
