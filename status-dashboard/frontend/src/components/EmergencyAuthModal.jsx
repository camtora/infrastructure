import { useState } from 'preact/hooks'

export function EmergencyAuthModal({ isOpen, onClose, onSave, onForget, currentKey }) {
  const [key, setKey] = useState('')

  if (!isOpen) return null

  const handleSave = () => {
    if (key.trim()) {
      onSave(key.trim())
      setKey('')
    }
  }

  const handleForget = () => {
    onForget()
    setKey('')
  }

  return (
    <div class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="glass-card p-6 max-w-md w-full">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-white">Emergency Access</h3>
        </div>

        <div class="text-white/70 text-sm space-y-3 mb-6">
          <p>
            Use this when the home server is down and you need admin access.
          </p>

          <div class="bg-white/5 rounded-lg p-3 text-xs space-y-2">
            <p class="text-white/90 font-medium">To find your admin API key:</p>
            <ol class="list-decimal list-inside space-y-1 text-white/60">
              <li>Go to <span class="text-amber-400">console.cloud.google.com</span></li>
              <li>Select project: <span class="text-amber-400">cameron-tora</span></li>
              <li>Navigate to: <span class="text-amber-400">Security → Secret Manager</span></li>
              <li>Open secret: <span class="text-amber-400">admin-api-key</span></li>
              <li>Click "View secret value"</li>
            </ol>
          </div>

          {currentKey && (
            <div class="flex items-center gap-2 text-emerald-400 text-xs">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>API key saved in this browser</span>
            </div>
          )}
        </div>

        <div class="mb-6">
          <label class="block text-xs text-white/50 mb-2">
            {currentKey ? 'Enter new key to replace:' : 'Enter API key:'}
          </label>
          <input
            type="password"
            value={key}
            onInput={(e) => setKey(e.target.value)}
            placeholder="Paste your admin API key here"
            class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10
                   text-white text-sm placeholder-white/30
                   focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50"
          />
        </div>

        <div class="flex gap-3">
          <button
            onClick={onClose}
            class="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10
                   text-white/70 hover:text-white transition-all duration-200 text-sm"
          >
            Cancel
          </button>
          {currentKey && (
            <button
              onClick={handleForget}
              class="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20
                     text-red-400 hover:text-red-300 transition-all duration-200 text-sm"
            >
              Forget Key
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!key.trim()}
            class="flex-1 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400
                   text-white font-medium transition-all duration-200 text-sm
                   disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  )
}
