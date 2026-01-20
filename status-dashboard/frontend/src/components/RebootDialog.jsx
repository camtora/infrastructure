import { useState, useEffect } from 'preact/hooks'

export function RebootDialog({ phase, stage, services, storage, sawDownState, startTime, onConfirm, onCancel, onClose }) {
  // phase: 'confirm' | 'rebooting' | 'complete'
  // stage: 'initiating' | 'waiting_down' | 'down' | 'recovering' | 'verifying' | 'timeout'
  // services: array of { name, status } from /api/status polling
  // storage: storage status from /api/status polling
  // sawDownState: whether we've observed the server go down

  if (!phase) return null

  return (
    <div class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="glass-card p-6 max-w-lg w-full">
        {phase === 'confirm' && (
          <ConfirmPhase onConfirm={onConfirm} onCancel={onCancel} />
        )}
        {phase === 'rebooting' && (
          <RebootingPhase
            services={services}
            storage={storage}
            stage={stage}
            sawDownState={sawDownState}
            startTime={startTime}
            onClose={onClose}
          />
        )}
        {phase === 'complete' && (
          <CompletePhase onClose={onClose} storage={storage} />
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

function RebootingPhase({ services, storage, stage, sawDownState, startTime, onClose }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startTime || Date.now())) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  const onlineCount = services?.filter(s => s.status === 'up').length || 0
  const downCount = services?.filter(s => s.status === 'down').length || 0
  const unknownCount = services?.filter(s => s.status === 'unknown').length || 0
  const totalCount = services?.length || 0

  const storageHealthy = storage?.status === 'healthy'
  const mountsOk = storage?.arrays?.every(a => a.mounted !== false) ?? true

  // Check if reboot is complete - must have seen down state
  const allServicesUp = totalCount > 0 && onlineCount === totalCount
  const isComplete = allServicesUp && (storageHealthy || !storage) && mountsOk && sawDownState

  // Show warning if we haven't seen down state but everything is up
  const showNoDownWarning = allServicesUp && !sawDownState && elapsed > 20

  // Stage-specific messaging
  const getStageInfo = () => {
    switch (stage) {
      case 'initiating':
        return { title: 'Initiating Restart', message: 'Sending restart command to server...', iconType: 'spin', color: 'amber' }
      case 'waiting_down':
        return { title: 'Waiting for Shutdown', message: 'Server should be shutting down. If services remain up, the restart may not have initiated.', iconType: 'spin', color: 'amber' }
      case 'down':
        return { title: 'Server Offline', message: 'Server is restarting. Waiting for services to come back online...', iconType: 'down', color: 'red' }
      case 'recovering':
        return { title: 'Server Recovering', message: 'Services are coming back online...', iconType: 'spin', color: 'amber' }
      case 'verifying':
        return { title: 'Server is Back Online', message: 'All services and storage have been verified.', iconType: 'check', color: 'emerald' }
      case 'timeout':
        return { title: 'Restart Timeout', message: 'Server did not come back online within the expected time.', iconType: 'warning', color: 'red' }
      default:
        return { title: 'Restarting Server', message: 'Please wait...', iconType: 'spin', color: 'amber' }
    }
  }

  const stageInfo = getStageInfo()

  const renderIcon = () => {
    if (stageInfo.iconType === 'check') {
      return (
        <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      )
    }
    if (stageInfo.iconType === 'spin') {
      return (
        <svg class={`w-5 h-5 text-${stageInfo.color}-400 animate-spin`} fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )
    }
    if (stageInfo.iconType === 'down') {
      return (
        <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656M6 18L18 6" />
        </svg>
      )
    }
    if (stageInfo.iconType === 'warning') {
      return (
        <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    }
    return null
  }

  const iconBgColor = {
    amber: 'bg-amber-500/20',
    emerald: 'bg-emerald-500/20',
    red: 'bg-red-500/20'
  }[stageInfo.color] || 'bg-amber-500/20'

  return (
    <>
      <div class="flex items-center gap-3 mb-4">
        <div class={`w-10 h-10 rounded-full flex items-center justify-center ${iconBgColor}`}>
          {renderIcon()}
        </div>
        <div>
          <h3 class="text-lg font-medium text-white">{stageInfo.title}</h3>
          <p class="text-xs text-white/50">Elapsed: {formatTime(elapsed)}</p>
        </div>
      </div>

      <p class="text-white/70 text-sm mb-4">{stageInfo.message}</p>

      {/* Stage progress indicator */}
      <div class="mb-4">
        <div class="flex justify-between text-xs text-white/40 mb-2">
          <span class={stage === 'initiating' || stage === 'waiting_down' ? 'text-amber-400' : (sawDownState ? 'text-emerald-400' : 'text-white/40')}>
            Initiating
          </span>
          <span class={stage === 'down' ? 'text-red-400' : (sawDownState ? 'text-emerald-400' : 'text-white/40')}>
            Offline
          </span>
          <span class={stage === 'recovering' ? 'text-amber-400' : (isComplete ? 'text-emerald-400' : 'text-white/40')}>
            Recovering
          </span>
          <span class={isComplete ? 'text-emerald-400' : 'text-white/40'}>
            Complete
          </span>
        </div>
        <div class="h-1 bg-white/10 rounded-full overflow-hidden flex">
          <div class={`h-full transition-all duration-300 ${sawDownState ? 'bg-emerald-400' : 'bg-amber-400'}`}
               style={{ width: '25%' }}></div>
          <div class={`h-full transition-all duration-300 ${sawDownState ? 'bg-emerald-400' : 'bg-white/10'}`}
               style={{ width: '25%' }}></div>
          <div class={`h-full transition-all duration-300 ${(stage === 'recovering' || isComplete) ? 'bg-emerald-400' : 'bg-white/10'}`}
               style={{ width: '25%' }}></div>
          <div class={`h-full transition-all duration-300 ${isComplete ? 'bg-emerald-400' : 'bg-white/10'}`}
               style={{ width: '25%' }}></div>
        </div>
      </div>

      {/* Warning if reboot may not have happened */}
      {showNoDownWarning && (
        <div class="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p class="text-amber-400 text-xs">
            Warning: Server never appeared to go offline. The restart may not have initiated successfully.
          </p>
        </div>
      )}

      {/* Services status */}
      <div class="mb-4">
        <div class="flex justify-between text-xs text-white/50 mb-2">
          <span>Services</span>
          <span>
            {unknownCount > 0 && <span class="text-white/40 mr-2">{unknownCount} waiting</span>}
            {downCount > 0 && <span class="text-red-400 mr-2">{downCount} offline</span>}
            <span class={onlineCount === totalCount ? 'text-emerald-400' : ''}>{onlineCount} / {totalCount} online</span>
          </span>
        </div>
        <div class="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            class={`h-full rounded-full transition-all duration-500 ${
              onlineCount === totalCount ? 'bg-emerald-400' :
              onlineCount > 0 ? 'bg-amber-400' : 'bg-red-400'
            }`}
            style={{ width: totalCount > 0 ? `${(onlineCount / totalCount) * 100}%` : '0%' }}
          ></div>
        </div>
      </div>

      <div class="max-h-48 overflow-y-auto space-y-2 mb-4">
        {services?.map(service => (
          <ServiceStatus key={service.name} service={service} />
        ))}
      </div>

      {/* Storage status section */}
      <div class="pt-4 border-t border-white/10">
        <div class="flex justify-between text-xs text-white/50 mb-2">
          <span>Storage Arrays</span>
          <span class={storageHealthy && mountsOk ? 'text-emerald-400' : storage ? 'text-amber-400' : 'text-white/40'}>
            {storage ? (storageHealthy && mountsOk ? 'Healthy' : 'Checking...') : 'Waiting...'}
          </span>
        </div>
        {storage?.arrays?.map(array => (
          <div key={array.name} class="flex items-center justify-between py-1.5 px-3 rounded bg-white/5 mb-1">
            <div class="flex items-center gap-2">
              <span class={`w-2 h-2 rounded-full ${
                array.status === 'healthy' && array.mounted ? 'bg-emerald-400' : 'bg-red-400'
              }`}></span>
              <span class="text-sm text-white/80">{array.name}</span>
            </div>
            <span class="text-xs text-white/50">
              {array.mounted ? 'Mounted' : 'Not Mounted'}
            </span>
          </div>
        ))}
        {!storage && (
          <div class="py-1.5 px-3 rounded bg-white/5 text-xs text-white/40">
            Waiting for storage status...
          </div>
        )}
      </div>

      {/* Show Close button when reboot is complete */}
      {isComplete && (
        <button
          onClick={onClose}
          class="w-full px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400
                 text-white font-medium transition-all duration-200 text-sm mt-4"
        >
          Close
        </button>
      )}

      {/* Allow closing with warning if no down state was seen */}
      {showNoDownWarning && (
        <button
          onClick={onClose}
          class="w-full px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20
                 text-white/70 font-medium transition-all duration-200 text-sm mt-4"
        >
          Close Anyway
        </button>
      )}

      {/* Allow closing on timeout */}
      {stage === 'timeout' && (
        <button
          onClick={onClose}
          class="w-full px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30
                 text-red-400 font-medium transition-all duration-200 text-sm mt-4"
        >
          Close
        </button>
      )}
    </>
  )
}

function ServiceStatus({ service }) {
  const isUp = service.status === 'up'
  const isUnknown = service.status === 'unknown'

  const statusColor = isUp ? 'bg-emerald-400' : isUnknown ? 'bg-white/30 animate-pulse' : 'bg-red-400'
  const textColor = isUp ? 'text-emerald-400' : isUnknown ? 'text-white/50' : 'text-red-400'
  const statusText = isUp ? 'Online' : isUnknown ? 'Waiting...' : 'Offline'

  return (
    <div class="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5">
      <div class="flex items-center gap-2">
        <span class={`w-2 h-2 rounded-full ${statusColor}`}></span>
        <span class="text-sm text-white/80">{service.name}</span>
      </div>
      <span class={`text-xs ${textColor}`}>
        {statusText}
      </span>
    </div>
  )
}

function CompletePhase({ onClose, storage }) {
  const storageHealthy = storage?.status === 'healthy'

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
        All services and storage arrays have been verified.
        {!storageHealthy && storage && (
          <span class="block mt-2 text-amber-400">
            Note: Storage status is {storage.status}
          </span>
        )}
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
