import { useState, useEffect, useRef, useCallback } from 'preact/hooks'

const PRESELECT_SLUGS = [
  'create', 'xaeros-minimap', 'xaero', 'waystones',
  'sophisticated-backpacks', 'sophisticated-storage',
  'iron-jetpacks', 'applied-energistics-2',
]

function shouldPreselect(slug) {
  return PRESELECT_SLUGS.some(s => slug === s || slug.startsWith(s))
}

function useDebounce(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

function fmtDownloads(n) {
  if (!n) return null
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

function InfoLink({ url }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       onClick={e => e.stopPropagation()} title="More info"
       class="flex-shrink-0 text-white/20 hover:text-cyan-400 transition-colors leading-none">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
      </svg>
    </a>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:  { icon: '⏳', cls: 'text-white/30 bg-white/[0.05]' },
  adding:   { icon: '⟳',  cls: 'text-violet-400 bg-violet-500/[0.15] animate-pulse' },
  ok:       { icon: '✓',  cls: 'text-green-400 bg-green-500/[0.15]' },
  skipped:  { icon: '⚠',  cls: 'text-amber-400 bg-amber-500/[0.15]' },
  error:    { icon: '✗',  cls: 'text-red-400 bg-red-500/[0.15]' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending
  return (
    <span class={`text-xs px-2 py-0.5 rounded font-mono font-medium flex-shrink-0 ${cfg.cls}`}>
      {cfg.icon}
    </span>
  )
}

// ── Mod card (browse / my pack) ───────────────────────────────────────────────

function ModCard({ mod, selected, onToggle }) {
  const dl = fmtDownloads(mod.downloads)
  return (
    <div class={`glass-card ${selected ? 'selected' : ''} p-3 cursor-pointer flex gap-2.5 items-start`}
         onClick={() => onToggle(mod.id)}>
      {mod.logo && (
        <img src={mod.logo} alt="" class="w-9 h-9 rounded-lg object-cover flex-shrink-0 mt-0.5"
             loading="lazy" onError={e => { e.target.style.display = 'none' }} />
      )}
      <div class="flex-1 min-w-0">
        <div class="flex items-start gap-1.5">
          <span class="flex-1 font-medium text-sm text-white leading-tight">{mod.name}</span>
          {mod.custom && <span class="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 flex-shrink-0 mt-0.5">custom</span>}
          <InfoLink url={mod.infoUrl} />
          <input type="checkbox" checked={selected}
                 onChange={() => onToggle(mod.id)} onClick={e => e.stopPropagation()}
                 class="flex-shrink-0 mt-0.5 accent-violet-400 cursor-pointer" />
        </div>
        {mod.summary && <p class="text-[11px] text-white/35 mt-1 leading-relaxed line-clamp-2">{mod.summary}</p>}
        <div class="mt-1.5 flex items-center gap-1.5">
          {mod.categories.slice(0, 2).map(c => (
            <span key={c} class="text-[10px] px-1.5 py-0.5 bg-white/[0.05] rounded text-white/25">{c}</span>
          ))}
          {dl && <span class="text-[10px] text-white/20 ml-auto tabular-nums">↓ {dl}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Build view ────────────────────────────────────────────────────────────────

function BuildView({ mods, selected, packName, onBack }) {
  const [phase, setPhase]           = useState('building') // building | done | error
  const [modStatus, setModStatus]   = useState({})
  const [log, setLog]               = useState([])
  const [result, setResult]         = useState(null)
  const [snapshots, setSnapshots]   = useState([])
  const [applyPhase, setApplyPhase] = useState(null)  // null | 'applying' | 'done' | 'error'
  const [applyLog, setApplyLog]     = useState([])
  const [applyCountdown, setApplyCountdown] = useState(null)
  const [showSnaps, setShowSnaps]   = useState(false)
  const abortRef                    = useRef(null)
  const applyLogRef                 = useRef(null)

  const selectedMods = mods.filter(m => selected.has(m.id))

  const loadSnapshots = async () => {
    const r = await fetch('/api/snapshots')
    setSnapshots(await r.json())
  }

  // Start build on mount
  useEffect(() => {
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Prime all mods as pending
    const init = {}
    mods.filter(m => selected.has(m.id)).forEach(m => { init[m.id] = { status: 'pending' } })
    setModStatus(init)

    ;(async () => {
      try {
        const resp = await fetch('/api/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...selected], name: packName }),
          signal: ctrl.signal,
        })

        const reader  = resp.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value)
          for (const line of text.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const msg = JSON.parse(line.slice(6))
              handleMsg(msg)
            } catch {}
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') setPhase('error')
      }
    })()

    loadSnapshots()
    return () => ctrl.abort()
  }, [])

  function handleMsg(msg) {
    if (msg.type === 'mod') {
      setModStatus(prev => ({ ...prev, [msg.id]: { status: msg.status, msg: msg.msg } }))
    } else if (msg.type === 'log') {
      setLog(prev => [...prev, msg.msg])
    } else if (msg.type === 'done') {
      setResult(msg)
      setPhase('done')
      loadSnapshots()
    } else if (msg.type === 'error') {
      setLog(prev => [...prev, `ERROR: ${msg.msg}`])
      setPhase('error')
    }
  }

  const counts = selectedMods.reduce((acc, m) => {
    const s = (modStatus[m.id] || {}).status || 'pending'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  const done    = (counts.ok || 0) + (counts.skipped || 0) + (counts.error || 0)
  const total   = selectedMods.length
  const pct     = total ? Math.round((done / total) * 100) : 0

  const applyToServer = async () => {
    setApplyPhase('applying')
    setApplyLog([])
    setApplyCountdown(null)

    const resp = await fetch('/api/server/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const reader  = resp.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const msg = JSON.parse(line.slice(6))
          if (msg.type === 'log')       { setApplyLog(p => [...p, msg.msg]); setApplyCountdown(null) }
          if (msg.type === 'countdown') { setApplyCountdown(`Restarting in ${msg.seconds}s`) }
          if (msg.type === 'waiting')   { setApplyCountdown(`Waiting for server... ${msg.seconds}s`) }
          if (msg.type === 'done')      { setApplyPhase('done'); setApplyCountdown(null) }
          if (msg.type === 'error')     { setApplyLog(p => [...p, `✗ ${msg.msg}`]); setApplyPhase('error') }
        } catch {}
      }
    }
  }

  const activateSnapshot = async (name) => {
    await fetch(`/api/snapshots/${name}/activate`, { method: 'POST' })
    await loadSnapshots()
  }

  const revertAndRestart = async (name) => {
    await activateSnapshot(name)
    const packForSnapshot = snapshots.find(s => s.name === name)
    // Restart server — it will use whatever current.mrpack is already set
    setApplying(true)
    setApplyMsg(null)
    const r = await fetch('/api/server/restart', { method: 'POST' })
    const data = await r.json()
    setApplying(false)
    setApplyMsg(r.ok ? `✓ Reverted to ${name} — server restarting` : `✗ ${data.error}`)
    await loadSnapshots()
  }

  return (
    <div class="min-h-screen flex flex-col">
      {/* Header */}
      <header class="sticky top-0 z-10 border-b border-white/[0.08] backdrop-blur-md bg-[#020617]/80">
        <div class="max-w-screen-xl mx-auto px-5 py-3">
          <div class="flex items-center gap-4 mb-2">
            <button onClick={onBack} class="text-white/40 hover:text-white/70 transition-colors text-sm">← Back</button>
            <span class="font-bold gradient-text">Building Pack</span>
            <span class="text-white/30 text-xs">{packName} · {total} mods</span>
            <div class="flex-1" />
            {phase === 'building' && (
              <span class="text-violet-400 text-sm animate-pulse">{done}/{total} mods processed</span>
            )}
            {phase === 'done' && (
              <span class="text-green-400 text-sm">
                ✓ {counts.ok || 0} added
                {counts.skipped ? <span class="text-amber-400 ml-2">⚠ {counts.skipped} skipped</span> : null}
                {counts.error ? <span class="text-red-400 ml-2">✗ {counts.error} errors</span> : null}
              </span>
            )}
            {phase === 'error' && <span class="text-red-400 text-sm">Build failed</span>}
          </div>

          {/* Progress bar */}
          <div class="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              class={`h-full rounded-full transition-all duration-300 ${phase === 'done' ? 'bg-green-500' : 'bg-violet-500'}`}
              style={{ width: `${phase === 'done' ? 100 : pct}%` }}
            />
          </div>
        </div>
      </header>

      {/* Mod list */}
      <main class="flex-1 max-w-screen-xl mx-auto w-full px-5 py-4">
        <div class="flex flex-col gap-1">
          {selectedMods.map(m => {
            const st = modStatus[m.id] || { status: 'pending' }
            return (
              <div key={m.id} class={`glass-card px-4 py-2.5 flex items-center gap-3
                ${st.status === 'ok' ? 'border-green-500/20' : ''}
                ${st.status === 'skipped' ? 'border-amber-500/20' : ''}
                ${st.status === 'error' ? 'border-red-500/20' : ''}
              `}>
                {m.logo && (
                  <img src={m.logo} alt="" class="w-7 h-7 rounded object-cover flex-shrink-0"
                       onError={e => { e.target.style.display = 'none' }} />
                )}
                <span class="flex-1 text-sm text-white font-medium truncate">{m.name}</span>
                {st.msg && (
                  <span class="text-[11px] text-white/30 truncate max-w-xs hidden md:block">{st.msg}</span>
                )}
                <StatusBadge status={st.status} />
              </div>
            )
          })}
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div class="mt-4 terminal">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
        )}

        {/* Done actions */}
        {phase === 'done' && result && (
          <div class="mt-6 glass-card p-5 flex flex-col gap-4">
            <div class="flex items-center gap-4 flex-wrap">
              <span class="text-sm text-white/60 flex-1">Pack built successfully.</span>
              <a href={`/packs/${result.file}`} download
                 class="px-5 py-2 bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.12] text-white font-medium rounded-lg text-sm transition-all">
                ↓ Download .mrpack
              </a>
              <button onClick={applyToServer} disabled={applyPhase === 'applying'}
                      class="px-5 py-2 bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white font-semibold rounded-lg text-sm transition-all">
                {applyPhase === 'applying' ? 'Applying...' : applyPhase === 'done' ? '✓ Applied' : 'Apply to Server'}
              </button>
            </div>

            {/* Apply progress */}
            {(applyLog.length > 0 || applyCountdown) && (
              <div class="terminal" ref={applyLogRef}>
                {applyLog.map((l, i) => <div key={i}>{l}</div>)}
                {applyCountdown && (
                  <div class="text-violet-400 animate-pulse">{applyCountdown}</div>
                )}
                {applyPhase === 'done' && <div class="text-green-400">✓ Server restarted with new pack</div>}
              </div>
            )}

            {/* Client install instructions */}
            <div class="border-t border-white/[0.06] pt-4">
              <p class="text-xs text-white/40 mb-2">To install on your client, import the <span class="text-white/60 font-mono">.mrpack</span> in your launcher:</p>
              <ul class="text-xs text-white/35 space-y-1">
                <li><span class="text-white/50">Prism Launcher</span> — Add Instance → Import from .mrpack</li>
                <li><span class="text-white/50">Modrinth App</span> — File → Add instance → Import from file</li>
                <li><span class="text-white/50">CurseForge App</span> — Create Custom Profile → Import</li>
              </ul>
            </div>
          </div>
        )}

        {/* Snapshot history */}
        {snapshots.length > 0 && (
          <div class="mt-6">
            <button onClick={() => setShowSnaps(v => !v)}
                    class="text-sm text-white/40 hover:text-white/60 transition-colors mb-3 flex items-center gap-2">
              <span>{showSnaps ? '▾' : '▸'}</span> Build history ({snapshots.length})
            </button>
            {showSnaps && (
              <div class="flex flex-col gap-1.5">
                {snapshots.map(s => (
                  <div key={s.name} class={`glass-card px-4 py-3 flex items-center gap-3
                    ${s.is_current ? 'border-violet-500/30 bg-violet-500/[0.06]' : ''}`}>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm text-white font-medium flex items-center gap-2">
                        {s.name}
                        {s.is_current && <span class="text-[10px] px-1.5 py-0.5 bg-violet-500/20 border border-violet-500/30 rounded text-violet-400">current</span>}
                      </div>
                      <div class="text-xs text-white/30 mt-0.5">{s.mod_count} mods</div>
                    </div>
                    {!s.is_current && (
                      <button onClick={() => revertAndRestart(s.name)} disabled={applying}
                              class="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-white/60 hover:text-white rounded-lg transition-all disabled:opacity-40">
                        Revert + Restart
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [mods, setMods]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [view, setView]           = useState('browse')
  const [search, setSearch]       = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [selected, setSelected]   = useState(new Set())
  const [saveStatus, setSaveStatus] = useState(null)
  const [packName, setPackName]   = useState('camerontora')
  const [recentPacks, setRecentPacks] = useState([])

  // Add custom mod state
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [customUrl, setCustomUrl]   = useState('')
  const [addingCustom, setAddingCustom] = useState(false)
  const [addCustomError, setAddCustomError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/mods').then(r => r.json()),
      fetch('/api/packs').then(r => r.json()),
      fetch('/api/selections').then(r => r.json()),
    ])
      .then(([modsData, packsData, savedIds]) => {
        setMods(modsData)
        setRecentPacks(packsData)
        if (savedIds.length > 0) {
          setSelected(new Set(savedIds))
        } else {
          const pre = new Set()
          modsData.forEach(m => { if (shouldPreselect(m.slug)) pre.add(m.id) })
          setSelected(pre)
        }
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  const saveToServer = useCallback(async (ids) => {
    setSaveStatus('saving')
    await fetch('/api/selections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...ids] }),
    })
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus(null), 2000)
  }, [])

  const debouncedSave = useDebounce(saveToServer, 800)

  const toggle = useCallback(id => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      debouncedSave(next)
      return next
    })
  }, [debouncedSave])

  const addCustomMod = async () => {
    setAddingCustom(true)
    setAddCustomError(null)
    try {
      const resp = await fetch('/api/mods/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: customUrl }),
      })
      const data = await resp.json()
      if (!resp.ok) { setAddCustomError(data.error || 'Failed'); return }
      setMods(prev => [...prev, data])
      setSelected(prev => {
        const next = new Set(prev)
        next.add(data.id)
        debouncedSave(next)
        return next
      })
      setCustomUrl('')
      setShowAddCustom(false)
    } catch (e) {
      setAddCustomError(e.message)
    } finally {
      setAddingCustom(false)
    }
  }

  const categories = (() => {
    const counts = {}
    mods.forEach(m => m.categories.forEach(c => { counts[c] = (counts[c] || 0) + 1 }))
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([c]) => c)
  })()

  const filtered = mods.filter(m => {
    if (search) {
      const q = search.toLowerCase()
      if (!m.name.toLowerCase().includes(q) && !m.summary.toLowerCase().includes(q)) return false
    }
    if (activeCategory && !m.categories.includes(activeCategory)) return false
    return true
  })

  const packMods = mods.filter(m => selected.has(m.id))
  const filteredPackMods = view === 'pack' && search
    ? packMods.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : packMods

  if (loading) {
    return (
      <div class="flex items-center justify-center min-h-screen">
        <div class="text-center space-y-2">
          <div class="text-2xl font-bold gradient-text">Mod Picker</div>
          <div class="text-white/40 text-sm">Fetching ATM10 mod list...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="flex items-center justify-center min-h-screen">
        <div class="glass-card p-8 max-w-md text-center">
          <div class="text-red-400 font-semibold mb-2">Failed to load mods</div>
          <div class="text-white/40 text-sm">{error}</div>
        </div>
      </div>
    )
  }

  // Build view takes over the whole page
  if (view === 'build') {
    return <BuildView mods={mods} selected={selected} packName={packName} onBack={() => setView('browse')} />
  }

  return (
    <div class="min-h-screen pb-20">
      {/* Header */}
      <header class="sticky top-0 z-10 border-b border-white/[0.08] backdrop-blur-md bg-[#020617]/80">
        <div class="max-w-screen-2xl mx-auto px-5 py-3">
          <div class="flex items-center gap-4 mb-2.5">
            <div class="flex-shrink-0">
              <span class="text-lg font-bold gradient-text">Mod Picker</span>
              <span class="ml-2 text-white/30 text-xs">ATM10 · NeoForge 1.21.1</span>
            </div>

            <input type="search"
                   placeholder={view === 'browse' ? 'Search all mods...' : 'Search my pack...'}
                   value={search} onInput={e => setSearch(e.target.value)}
                   class="flex-1 bg-white/[0.05] border border-white/[0.10] rounded-lg px-4 py-1.5 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/40 focus:bg-white/[0.08] transition-all" />

            <span class="text-white/25 text-xs flex-shrink-0 tabular-nums">
              {view === 'browse' ? `${filtered.length}/${mods.length}` : `${filteredPackMods.length}/${selected.size}`}
            </span>

            <button onClick={() => { setShowAddCustom(true); setAddCustomError(null); setCustomUrl('') }}
                    title="Add mod by CurseForge URL"
                    class="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.05] border border-white/[0.10] text-white/40 hover:text-violet-400 hover:border-violet-500/40 transition-all text-lg leading-none">+</button>

            {/* View tabs */}
            <div class="flex bg-white/[0.05] rounded-lg p-0.5 border border-white/[0.08] flex-shrink-0">
              <button onClick={() => setView('browse')}
                      class={`px-4 py-1 rounded-md text-sm font-medium transition-all ${view === 'browse' ? 'bg-white/[0.12] text-white' : 'text-white/40 hover:text-white/60'}`}>
                Browse
              </button>
              <button onClick={() => setView('pack')}
                      class={`px-4 py-1 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${view === 'pack' ? 'bg-white/[0.12] text-white' : 'text-white/40 hover:text-white/60'}`}>
                My Pack
                <span class={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${view === 'pack' ? 'bg-violet-500/30 text-violet-400' : 'bg-white/[0.08] text-white/40'}`}>
                  {selected.size}
                </span>
              </button>
            </div>

            {saveStatus && (
              <span class={`text-xs flex-shrink-0 transition-all ${saveStatus === 'saved' ? 'text-violet-400/70' : 'text-white/30'}`}>
                {saveStatus === 'saving' ? 'Saving...' : '✓ Saved'}
              </span>
            )}
          </div>

          {/* Category chips — browse only */}
          {view === 'browse' && (
            <div class="flex gap-1.5 flex-wrap">
              <span class={`cat-chip ${!activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(null)}>All</span>
              {categories.map(c => (
                <span key={c} class={`cat-chip ${activeCategory === c ? 'active' : ''}`}
                      onClick={() => setActiveCategory(activeCategory === c ? null : c)}>{c}</span>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Browse view */}
      {view === 'browse' && (
        <main class="max-w-screen-2xl mx-auto px-5 py-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
            {filtered.map(m => (
              <ModCard key={m.id} mod={m} selected={selected.has(m.id)} onToggle={toggle} />
            ))}
          </div>
        </main>
      )}

      {/* My Pack view */}
      {view === 'pack' && (
        <main class="max-w-screen-2xl mx-auto px-5 py-4">
          {filteredPackMods.length === 0 ? (
            <div class="text-center py-20 text-white/25">
              {selected.size === 0 ? 'No mods selected yet.' : 'No mods match your search.'}
            </div>
          ) : (
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
              {filteredPackMods.map(m => (
                <ModCard key={m.id} mod={m} selected={true} onToggle={toggle} />
              ))}
            </div>
          )}
        </main>
      )}

      {/* Footer */}
      <footer class="fixed bottom-0 left-0 right-0 z-10 border-t border-white/[0.08] backdrop-blur-md bg-[#020617]/90">
        <div class="max-w-screen-2xl mx-auto px-5 py-2.5 flex items-center gap-4">
          <span class="text-sm text-white/50">
            <span class="text-violet-400 font-semibold tabular-nums">{selected.size}</span> in pack
          </span>
          {recentPacks.length > 0 && (
            <a href={recentPacks[0].url} download class="text-xs text-white/30 hover:text-violet-400 transition-colors">↓ Last build</a>
          )}
          <div class="flex-1" />
          <div class="flex items-center gap-2">
            <input type="text" value={packName} onInput={e => setPackName(e.target.value)}
                   placeholder="pack name"
                   class="w-32 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/60 outline-none focus:border-violet-500/40 transition-all" />
            <button onClick={() => setView('build')} disabled={selected.size === 0}
                    class="px-5 py-2 bg-violet-500 hover:bg-violet-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition-all">
              Build Pack
            </button>
          </div>
        </div>
      </footer>

      {/* Add custom mod modal */}
      {showAddCustom && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div class="glass-card w-full max-w-lg p-6 flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <h2 class="font-semibold gradient-text">Add Custom Mod</h2>
              <button onClick={() => setShowAddCustom(false)} class="text-white/30 hover:text-white/60 transition-colors text-xl leading-none">×</button>
            </div>
            <p class="text-xs text-white/40">Paste a CurseForge mod page URL — it'll be added to your list and auto-selected.</p>
            <input type="url" placeholder="https://www.curseforge.com/minecraft/mc-mods/..."
                   value={customUrl} onInput={e => setCustomUrl(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && !addingCustom && customUrl && addCustomMod()}
                   class="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-violet-500/40 transition-all font-mono"
                   autoFocus />
            {addCustomError && <p class="text-xs text-red-400">{addCustomError}</p>}
            <div class="flex items-center justify-end gap-3">
              <button onClick={() => setShowAddCustom(false)} class="text-sm text-white/40 hover:text-white/60 transition-colors px-3 py-1.5">Cancel</button>
              <button onClick={addCustomMod} disabled={!customUrl || addingCustom}
                      class="px-5 py-2 bg-violet-500 hover:bg-violet-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition-all">
                {addingCustom ? 'Adding...' : 'Add Mod'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
