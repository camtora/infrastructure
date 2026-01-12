import { useState, useEffect } from 'preact/hooks'
import { Header } from './components/Header'
import { FailoverBanner } from './components/FailoverBanner'
import { ServiceGrid } from './components/ServiceGrid'
import { MetricsPanel } from './components/MetricsPanel'
import { SpeedPanel } from './components/SpeedPanel'
import { DNSPanel } from './components/DNSPanel'
import { HistoryPanel } from './components/HistoryPanel'

export function App() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

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

  useEffect(() => {
    fetchStatus()
    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !status) {
    return (
      <div class="min-h-screen flex items-center justify-center">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p class="text-gray-400">Loading status...</p>
        </div>
      </div>
    )
  }

  const isFailoverMode = status?.dns?.target === 'gcp'

  return (
    <div class="min-h-screen">
      {isFailoverMode && <FailoverBanner />}

      <div class="max-w-7xl mx-auto px-4 py-8">
        <Header
          status={status}
          lastUpdate={lastUpdate}
          onRefresh={fetchStatus}
        />

        {error && (
          <div class="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <p class="text-red-200">Error: {error}</p>
          </div>
        )}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div class="lg:col-span-2">
            <MetricsPanel metrics={status?.metrics} />
          </div>
          <div>
            <SpeedPanel speedTest={status?.metrics?.speed_test} />
          </div>
        </div>

        <div class="mb-8">
          <DNSPanel dns={status?.dns} />
        </div>

        <ServiceGrid services={status?.services || []} />

        <div class="mt-8">
          <HistoryPanel services={status?.services || []} />
        </div>
      </div>

      <footer class="text-center py-6 text-gray-500 text-sm">
        <p>camerontora.ca Status Dashboard</p>
        {lastUpdate && (
          <p class="mt-1">Last updated: {lastUpdate.toLocaleTimeString()}</p>
        )}
      </footer>
    </div>
  )
}
