import { useState, useEffect } from 'preact/hooks'

export function RebootDialog({ phase, services, onConfirm, onCancel, onClose }) {
  // phase: 'confirm' | 'rebooting' | 'complete'
  // services: array of { name, status } from /api/status polling

  if (!phase) return null

  return (
    <div class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="glass-card p-6 max-w-lg w-full">
        {phase === 'confirm' && (
          <ConfirmPhase onConfirm={onConfirm} onCancel={onCancel} />
        )}
        {phase === 'rebooting' && (
          <RebootingPhase services={services} />
        )}
        {phase === 'complete' && (
          <CompletePhase onClose={onClose} />
        )}
      </div>
    </div>
  )
}

function ConfirmPhase({ onConfirm, onCancel }) {
  return (
    <>
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-white">Restart Server</h3>
      </div>

      <p class="text-white/70 text-sm mb-6">
        Are you sure you want to restart the server? All services will be temporarily unavailable
        for approximately 60-90 seconds.
      </p>

      <div class="flex gap-3">
        <button
          onClick={onCancel}
          class="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10
                 text-white/70 hover:text-white transition-all duration-200 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          class="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-400
                 text-white font-medium transition-all duration-200 text-sm"
        >
          Yes, Restart Server
        </button>
      </div>
    </>
  )
}

function RebootingPhase({ services }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(e => e + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  const onlineCount = services?.filter(s => s.status === 'up').length || 0
  const totalCount = services?.length || 0

  return (
    <>
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-medium text-white">Server Restarting</h3>
          <p class="text-xs text-white/50">Elapsed: {formatTime(elapsed)}</p>
        </div>
      </div>

      <p class="text-white/70 text-sm mb-4">
        Waiting for services to come back online...
      </p>

      <div class="mb-4">
        <div class="flex justify-between text-xs text-white/50 mb-2">
          <span>Services Online</span>
          <span>{onlineCount} / {totalCount}</span>
        </div>
        <div class="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            class="h-full bg-emerald-400 rounded-full transition-all duration-500"
            style={{ width: totalCount > 0 ? `${(onlineCount / totalCount) * 100}%` : '0%' }}
          ></div>
        </div>
      </div>

      <div class="max-h-64 overflow-y-auto space-y-2">
        {services?.map(service => (
          <ServiceStatus key={service.name} service={service} />
        ))}
      </div>
    </>
  )
}

function ServiceStatus({ service }) {
  const isUp = service.status === 'up'

  return (
    <div class="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5">
      <div class="flex items-center gap-2">
        <span class={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
        <span class="text-sm text-white/80">{service.name}</span>
      </div>
      <span class={`text-xs ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
        {isUp ? 'Online' : 'Offline'}
      </span>
    </div>
  )
}

function CompletePhase({ onClose }) {
  return (
    <>
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-white">Server is Back Online</h3>
      </div>

      <p class="text-white/70 text-sm mb-6">
        All services have been restored successfully.
      </p>

      <button
        onClick={onClose}
        class="w-full px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400
               text-white font-medium transition-all duration-200 text-sm"
      >
        Close
      </button>
    </>
  )
}
