import { useState, useEffect, useRef, useCallback } from 'preact/hooks'

const PRESELECT_SLUGS = [
  'create', 'xaeros-minimap', 'xaero', 'waystones',
  'sophisticated-backpacks', 'sophisticated-storage',
  'iron-jetpacks', 'applied-energistics-2',
]

function shouldPreselect(slug) {
  return PRESELECT_SLUGS.some(s => slug === s || slug.startsWith(s))
}

// Debounce helper
function useDebounce(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

export default function App() {
  const [mods, setMods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('browse') // 'browse' | 'pack'
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saving' | 'saved'
  const [showBuild, setShowBuild] = useState(false)
  const [packName, setPackName] = useState('camerontora')
  const [building, setBuilding] = useState(false)
  const [buildLog, setBuildLog] = useState([])
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [recentPacks, setRecentPacks] = useState([])
  const logRef = useRef(null)

  // Load mods + saved selections on mount
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
          // First time: pre-select known wants
          const pre = new Set()
          modsData.forEach(m => { if (shouldPreselect(m.slug)) pre.add(m.id) })
          setSelected(pre)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Auto-scroll terminal
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [buildLog])

  // Save selections to server (debounced 800ms after last change)
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

  const removeFromPack = useCallback(id => {
    setSelected(prev => {
      const next = new Set(prev)
      next.delete(id)
      debouncedSave(next)
      return next
    })
  }, [debouncedSave])

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
  const packSearch = search.toLowerCase()
  const filteredPackMods = view === 'pack' && search
    ? packMods.filter(m => m.name.toLowerCase().includes(packSearch) || m.summary.toLowerCase().includes(packSearch))
    : packMods

  const openBuild = () => {
    setShowBuild(true)
    setBuildLog([])
    setDownloadUrl(null)
  }

  const build = async () => {
    setBuilding(true)
    setBuildLog([])
    setDownloadUrl(null)

    const resp = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected], name: packName }),
    })

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const msg = line.slice(6).trim()
        if (msg.startsWith('DONE:')) {
          const payload = msg.slice(5)
          if (payload !== 'error') {
            const url = `/packs/${payload}`
            setDownloadUrl(url)
            setRecentPacks(prev => [{ name: payload, url }, ...prev].slice(0, 10))
          }
          setBuilding(false)
        } else if (msg) {
          setBuildLog(prev => [...prev, msg])
        }
      }
    }
  }

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
          <div class="text-white/30 text-xs mt-3">Check that CURSEFORGE_API_KEY is set in the container environment.</div>
        </div>
      </div>
    )
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

            {/* View tabs */}
            <div class="flex bg-white/[0.05] rounded-lg p-0.5 border border-white/[0.08]">
              <button
                onClick={() => setView('browse')}
                class={`px-4 py-1 rounded-md text-sm font-medium transition-all ${view === 'browse' ? 'bg-white/[0.12] text-white' : 'text-white/40 hover:text-white/60'}`}
              >Browse</button>
              <button
                onClick={() => setView('pack')}
                class={`px-4 py-1 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${view === 'pack' ? 'bg-white/[0.12] text-white' : 'text-white/40 hover:text-white/60'}`}
              >
                My Pack
                <span class={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${view === 'pack' ? 'bg-emerald-500/30 text-emerald-400' : 'bg-white/[0.08] text-white/40'}`}>
                  {selected.size}
                </span>
              </button>
            </div>

            <input
              type="search"
              placeholder={view === 'browse' ? 'Search all mods...' : 'Search my pack...'}
              value={search}
              onInput={e => setSearch(e.target.value)}
              class="flex-1 bg-white/[0.05] border border-white/[0.10] rounded-lg px-4 py-1.5 text-sm text-white placeholder-white/25 outline-none focus:border-emerald-500/40 focus:bg-white/[0.08] transition-all"
            />

            <span class="text-white/25 text-xs flex-shrink-0 tabular-nums">
              {view === 'browse' ? `${filtered.length}/${mods.length}` : `${filteredPackMods.length}/${selected.size}`}
            </span>

            {saveStatus && (
              <span class={`text-xs flex-shrink-0 transition-all ${saveStatus === 'saved' ? 'text-emerald-400/70' : 'text-white/30'}`}>
                {saveStatus === 'saving' ? 'Saving...' : '✓ Saved'}
              </span>
            )}
          </div>

          {/* Category chips — browse only */}
          {view === 'browse' && (
            <div class="flex gap-1.5 flex-wrap">
              <span
                class={`cat-chip ${!activeCategory ? 'active' : ''}`}
                onClick={() => setActiveCategory(null)}
              >All</span>
              {categories.map(c => (
                <span
                  key={c}
                  class={`cat-chip ${activeCategory === c ? 'active' : ''}`}
                  onClick={() => setActiveCategory(activeCategory === c ? null : c)}
                >{c}</span>
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
              {selected.size === 0
                ? 'No mods selected yet — browse and check some mods to add them.'
                : 'No mods match your search.'}
            </div>
          ) : (
            <div class="flex flex-col gap-1.5">
              {filteredPackMods.map(m => (
                <PackRow key={m.id} mod={m} onRemove={removeFromPack} />
              ))}
            </div>
          )}
        </main>
      )}

      {/* Footer */}
      <footer class="fixed bottom-0 left-0 right-0 z-10 border-t border-white/[0.08] backdrop-blur-md bg-[#020617]/90">
        <div class="max-w-screen-2xl mx-auto px-5 py-2.5 flex items-center gap-4">
          <span class="text-sm text-white/50">
            <span class="text-emerald-400 font-semibold tabular-nums">{selected.size}</span> in pack
          </span>
          {recentPacks.length > 0 && (
            <a href={recentPacks[0].url} download class="text-xs text-white/30 hover:text-emerald-400 transition-colors">
              ↓ Last build
            </a>
          )}
          <div class="flex-1" />
          <button
            onClick={openBuild}
            disabled={selected.size === 0}
            class="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed text-gray-900 font-semibold rounded-lg text-sm transition-all"
          >Build Pack</button>
        </div>
      </footer>

      {/* Build modal */}
      {showBuild && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div class="glass-card w-full max-w-xl p-6 flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <h2 class="font-semibold gradient-text">Build Modpack</h2>
              {!building && (
                <button onClick={() => setShowBuild(false)} class="text-white/30 hover:text-white/60 transition-colors text-xl leading-none">×</button>
              )}
            </div>

            <div class="flex items-center gap-3">
              <span class="text-sm text-white/40 flex-shrink-0">Name</span>
              <input
                type="text"
                value={packName}
                onInput={e => setPackName(e.target.value)}
                disabled={building}
                class="flex-1 bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-500/40 transition-all disabled:opacity-50"
              />
              <span class="text-xs text-white/30 flex-shrink-0">{selected.size} mods</span>
            </div>

            {buildLog.length > 0 && (
              <div ref={logRef} class="terminal">
                {buildLog.map((line, i) => <div key={i}>{line}</div>)}
                {building && <span class="animate-pulse">▋</span>}
              </div>
            )}

            {downloadUrl && (
              <div class="flex items-center gap-3 p-3 bg-emerald-500/[0.10] border border-emerald-500/[0.25] rounded-lg">
                <span class="text-emerald-400 text-sm flex-1">Pack ready!</span>
                <a href={downloadUrl} download class="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-semibold rounded-lg text-sm transition-all">
                  Download .mrpack
                </a>
              </div>
            )}

            <div class="flex items-center justify-end gap-3">
              {!building && !downloadUrl && (
                <>
                  <button onClick={() => setShowBuild(false)} class="text-sm text-white/40 hover:text-white/60 transition-colors px-3 py-1.5">Cancel</button>
                  <button onClick={build} class="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-semibold rounded-lg text-sm transition-all">
                    Build {selected.size} mods
                  </button>
                </>
              )}
              {building && <span class="text-white/40 text-sm animate-pulse">Building...</span>}
              {downloadUrl && !building && (
                <button onClick={() => setShowBuild(false)} class="text-sm text-emerald-400 hover:text-emerald-300 transition-colors px-3 py-1.5">Done</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title="More info"
      class="flex-shrink-0 text-white/20 hover:text-cyan-400 transition-colors leading-none"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
      </svg>
    </a>
  )
}

function ModCard({ mod, selected, onToggle }) {
  const dl = fmtDownloads(mod.downloads)
  return (
    <div
      class={`glass-card ${selected ? 'selected' : ''} p-3 cursor-pointer flex gap-2.5 items-start`}
      onClick={() => onToggle(mod.id)}
    >
      {mod.logo && (
        <img src={mod.logo} alt="" class="w-9 h-9 rounded-lg object-cover flex-shrink-0 mt-0.5" loading="lazy"
          onError={e => { e.target.style.display = 'none' }} />
      )}
      <div class="flex-1 min-w-0">
        <div class="flex items-start gap-1.5">
          <span class="flex-1 font-medium text-sm text-white leading-tight">{mod.name}</span>
          <InfoLink url={mod.infoUrl} />
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(mod.id)}
            onClick={e => e.stopPropagation()}
            class="flex-shrink-0 mt-0.5 accent-emerald-400 cursor-pointer"
          />
        </div>
        {mod.summary && (
          <p class="text-[11px] text-white/35 mt-1 leading-relaxed line-clamp-2">{mod.summary}</p>
        )}
        <div class="mt-1.5 flex items-center gap-1.5">
          {mod.categories.slice(0, 2).map(c => (
            <span key={c} class="text-[10px] px-1.5 py-0.5 bg-white/[0.05] rounded text-white/25">{c}</span>
          ))}
          {dl && (
            <span class="text-[10px] text-white/20 ml-auto tabular-nums">↓ {dl}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function PackRow({ mod, onRemove }) {
  const dl = fmtDownloads(mod.downloads)
  return (
    <div class="glass-card px-4 py-3 flex items-center gap-3 group">
      {mod.logo && (
        <img src={mod.logo} alt="" class="w-8 h-8 rounded-lg object-cover flex-shrink-0"
          onError={e => { e.target.style.display = 'none' }} />
      )}
      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm text-white">{mod.name}</div>
        {mod.summary && <div class="text-[11px] text-white/35 truncate mt-0.5">{mod.summary}</div>}
      </div>
      {dl && <span class="text-[10px] text-white/25 tabular-nums hidden sm:inline">↓ {dl}</span>}
      {mod.categories.slice(0, 1).map(c => (
        <span key={c} class="text-[10px] px-2 py-0.5 bg-white/[0.05] rounded text-white/25 hidden sm:inline">{c}</span>
      ))}
      <InfoLink url={mod.infoUrl} />
      <button
        onClick={() => onRemove(mod.id)}
        class="text-white/20 hover:text-red-400 transition-colors text-lg leading-none flex-shrink-0 opacity-0 group-hover:opacity-100"
        title="Remove from pack"
      >×</button>
    </div>
  )
}
