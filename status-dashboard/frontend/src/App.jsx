import { useState, useEffect } from 'preact/hooks'
import { Header } from './components/Header'
import { FailoverBanner } from './components/FailoverBanner'
import { ServiceGrid } from './components/ServiceGrid'
import { MetricsPanel } from './components/MetricsPanel'
import { SpeedPanel } from './components/SpeedPanel'
import { DNSPanel } from './components/DNSPanel'
import { HistoryPanel } from './components/HistoryPanel'
import { AdminPanel } from './components/AdminPanel'

const NETDATA_BASE = 'https://netdata.camerontora.ca'

// Parse Netdata CPU response and calculate total CPU%
function parseCpuMetrics(data) {
  if (!data?.labels || !data?.data?.[0]) {
    throw new Error('Invalid CPU metrics format')
  }
  // Labels: time, guest_nice, guest, steal, softirq, irq, user, system, nice, iowait
  // Sum all CPU-consuming fields (everything except time)
  const values = data.data[0]
  const cpuPercent = values.slice(1).reduce((sum, val) => sum + (val || 0), 0)
  return { percent: Math.round(cpuPercent * 10) / 10 }
}

// Parse Netdata RAM response and calculate usage%
function parseRamMetrics(data) {
  if (!data?.labels || !data?.data?.[0]) {
    throw new Error('Invalid RAM metrics format')
  }
  // Labels: time, free, used, cached, buffers (all in MB)
  const labels = data.labels
  const values = data.data[0]
  const idx = (name) => labels.indexOf(name)

  const free = values[idx('free')] || 0
  const used = values[idx('used')] || 0
  const cached = values[idx('cached')] || 0
  const buffers = values[idx('buffers')] || 0

  const total = free + used + cached + buffers
  const percent = total > 0 ? (used / total) * 100 : 0

  return {
    percent: Math.round(percent * 10) / 10,
    used_gb: Math.round(used / 1024 * 10) / 10,
    total_gb: Math.round(total / 1024 * 10) / 10,
    available_gb: Math.round((free + cached + buffers) / 1024 * 10) / 10
  }
}

export function App() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [realtimeMetrics, setRealtimeMetrics] = useState(null)
  const [metricsError, setMetricsError] = useState(null)

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/status')
      if (!response.ok) throw new Error('Failed to fetch status')
      const data = await response.json()
      setStatus(data)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Fetch real-time CPU/RAM from Netdata (every 10 seconds)
  const fetchRealtimeMetrics = async () => {
    try {
      const [cpuRes, ramRes] = await Promise.all([
        fetch(`${NETDATA_BASE}/api/metrics/cpu`),
        fetch(`${NETDATA_BASE}/api/metrics/ram`)
      ])

      if (!cpuRes.ok || !ramRes.ok) {
        throw new Error('Netdata metrics endpoint unavailable')
      }

      const [cpuData, ramData] = await Promise.all([
        cpuRes.json(),
        ramRes.json()
      ])

      const cpu = parseCpuMetrics(cpuData)
      const memory = parseRamMetrics(ramData)

      setRealtimeMetrics({ cpu, memory, timestamp: new Date() })
      setMetricsError(null)
    } catch (err) {
      console.error('Real-time metrics error:', err.message)
      setMetricsError(err.message)
      // Don't clear realtimeMetrics - keep showing last known value
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  // Separate interval for real-time metrics (10 seconds)
  useEffect(() => {
    fetchRealtimeMetrics()
    const interval = setInterval(fetchRealtimeMetrics, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !status) {
    return (
      <div class="min-h-screen flex items-center justify-center">
        <div class="text-center">
          <div class="relative w-16 h-16 mx-auto mb-6">
            <div class="absolute inset-0 rounded-full border-2 border-white/10"></div>
            <div class="absolute inset-0 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin"></div>
          </div>
          <p class="text-white/60 text-sm">Loading status...</p>
        </div>
      </div>
    )
  }

  const isFailoverMode = status?.dns?.target === 'gcp'

  return (
    <div class="min-h-screen">
      {isFailoverMode && <FailoverBanner />}

      <div class="max-w-7xl mx-auto px-6 py-10">
        <Header
          status={status}
          lastUpdate={lastUpdate}
          onRefresh={fetchStatus}
        />

        {error && (
          <div class="glass-card border-red-500/30 bg-red-500/10 p-4 mb-8">
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p class="text-red-200 text-sm">{error}</p>
            </div>
          </div>
        )}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div class="lg:col-span-2">
            <MetricsPanel
              metrics={status?.metrics}
              realtimeMetrics={realtimeMetrics}
              metricsError={metricsError}
            />
          </div>
          <div>
            <SpeedPanel speedTest={status?.metrics?.speed_test} />
          </div>
        </div>

        <div class="mb-8">
          <DNSPanel dns={status?.dns} />
        </div>

        <div class="mb-8">
          <AdminPanel />
        </div>

        <ServiceGrid services={status?.services || []} />

        <div class="mt-8">
          <HistoryPanel services={status?.services || []} />
        </div>
      </div>

      <footer class="text-center py-8 border-t border-white/[0.06]">
        <p class="text-white/40 text-sm">camerontora.ca Status Dashboard</p>
        {lastUpdate && (
          <p class="text-white/30 text-xs mt-2">Last updated: {lastUpdate.toLocaleTimeString()}</p>
        )}
      </footer>
    </div>
  )
}
