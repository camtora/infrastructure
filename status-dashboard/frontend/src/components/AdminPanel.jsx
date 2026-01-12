import { useState, useEffect } from 'preact/hooks'

const HEALTH_API = 'https://health.camerontora.ca'

export function AdminPanel() {
  const [auth, setAuth] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [vpnStatus, setVpnStatus] = useState(null)
  const [switching, setSwitching] = useState(false)
  const [message, setMessage] = useState(null)

  // Check authentication status on mount
  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const res = await fetch(`${HEALTH_API}/api/admin/whoami`, {
        credentials: 'include'
      })
      if (res.ok) {
        const data = await res.json()
        setAuth(data)
        // If authenticated, fetch VPN status
        fetchVpnStatus()
      } else {
        setAuth(null)
      }
    } catch (e) {
      console.error('Auth check failed:', e)
      setAuth(null)
    } finally {
      setAuthLoading(false)
    }
  }

  async function fetchVpnStatus() {
    try {
      const res = await fetch(`${HEALTH_API}/api/admin/vpn/status`, {
        credentials: 'include'
      })
      if (res.ok) {
        setVpnStatus(await res.json())
      }
    } catch (e) {
      console.error('Failed to fetch VPN status:', e)
    }
  }

  async function switchVpn(location) {
    const confirmed = confirm(
      `Switch Transmission to ${location.charAt(0).toUpperCase() + location.slice(1)} VPN?\n\n` +
      `This will briefly interrupt active downloads.`
    )
    if (!confirmed) return

    setSwitching(true)
    setMessage(null)

    try {
      const res = await fetch(`${HEALTH_API}/api/admin/vpn/switch`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location })
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        // Wait for containers to stabilize
        await new Promise(r => setTimeout(r, 3000))
        fetchVpnStatus()
      } else {
        setMessage({ type: 'error', text: data.error || 'Switch failed' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message })
    } finally {
      setSwitching(false)
    }
  }

  // Still loading auth status
  if (authLoading) return null

  // Not authenticated - don't show admin panel
  if (!auth || !auth.is_admin) return null

  return (
    <div class="glass-card p-6">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 class="text-lg font-medium text-white">Admin Panel</h2>
        </div>
        <span class="text-xs text-white/40">{auth.email}</span>
      </div>

      {/* VPN Location Switcher */}
      <div class="mb-6">
        <h3 class="text-xs font-medium text-white/50 uppercase tracking-wider mb-4">
          VPN Location (Transmission)
        </h3>

        {vpnStatus ? (
          <div class="grid grid-cols-3 gap-3">
            {vpnStatus.locations.map(loc => (
              <button
                key={loc.name}
                onClick={() => !loc.active && !switching && switchVpn(loc.name)}
                disabled={loc.active || switching || !loc.healthy}
                class={`p-4 rounded-xl text-sm font-medium transition-all ${
                  loc.active
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                    : loc.healthy
                    ? 'bg-white/5 text-white/70 hover:bg-white/10 border border-white/10 hover:border-white/20'
                    : 'bg-red-500/10 text-red-400/50 border border-red-500/20 cursor-not-allowed'
                }`}
              >
                <div class="capitalize text-base mb-1">{loc.name}</div>
                <div class="text-xs opacity-60">
                  {loc.active ? (
                    <span class="flex items-center justify-center gap-1">
                      <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                      Active
                    </span>
                  ) : loc.healthy ? (
                    'Available'
                  ) : (
                    'Unhealthy'
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div class="text-white/40 text-sm">Loading VPN status...</div>
        )}

        {switching && (
          <div class="mt-4 flex items-center gap-2 text-amber-400 text-sm">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Switching VPN location...
          </div>
        )}

        {message && (
          <div class={`mt-4 text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {message.text}
          </div>
        )}
      </div>

      {/* Future admin features placeholder */}
      <div class="pt-4 border-t border-white/[0.06]">
        <p class="text-xs text-white/30">
          More admin features coming soon: auto-failover, container restart, SSL warnings
        </p>
      </div>
    </div>
  )
}
