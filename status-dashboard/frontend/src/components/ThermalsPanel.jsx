function tempColor(temp, high, crit) {
  if (temp >= crit * 0.85) return { fill: '#f87171', glow: 'rgba(248,113,113,0.4)', text: 'text-red-400' }
  if (temp >= high * 0.85) return { fill: '#fbbf24', glow: 'rgba(251,191,36,0.35)', text: 'text-amber-400' }
  return { fill: 'rgba(255,255,255,0.65)', glow: 'rgba(255,255,255,0.15)', text: 'text-white/70' }
}

const SIZES = {
  lg:   { tubeW: 14, tubeH: 100, bulbR: 12, svgW: 40 },
  sm:   { tubeW: 10, tubeH: 72,  bulbR: 9,  svgW: 30 },
  md:   { tubeW: 8,  tubeH: 58,  bulbR: 7,  svgW: 24 }, // between sm and xs
  xs:   { tubeW: 6,  tubeH: 48,  bulbR: 5,  svgW: 18 },
  dial: { tubeW: 8,  tubeH: 46,  bulbR: 7,  svgW: 24 }, // matches w-16 h-16 dial height (64px svg)
}

export function Thermometer({ label, temp, high, crit, size = 'sm', inlineTemp = false }) {
  const { tubeW, tubeH, bulbR, svgW } = SIZES[size] || SIZES.sm
  const svgH  = tubeH + bulbR * 2 + 4
  const cx    = svgW / 2
  const r     = tubeW / 2
  const bulbY = tubeH + 2 + bulbR

  const fillPct = Math.min(Math.max((temp / crit) * 100, 4), 100)
  const fillH   = (fillPct / 100) * tubeH
  const fillY   = tubeH - fillH + 2

  const { fill, glow, text } = tempColor(temp, high, crit)

  const tubeBgPath   = `M ${cx-r} ${tubeH+2} L ${cx-r} ${2+r} Q ${cx-r} 2 ${cx} 2 Q ${cx+r} 2 ${cx+r} ${2+r} L ${cx+r} ${tubeH+2} Z`
  const tubeFillPath = `M ${cx-r} ${tubeH+2} L ${cx-r} ${fillY} Q ${cx-r} ${fillY-r} ${cx} ${fillY-r} Q ${cx+r} ${fillY-r} ${cx+r} ${fillY} L ${cx+r} ${tubeH+2} Z`

  const isLg   = size === 'lg'
  const isSmall = size === 'xs' || size === 'dial'
  const uid  = `${label}-${size}`.replace(/\s+/g, '-')

  if (inlineTemp) {
    return (
      <div class="flex items-center gap-1.5">
        <div class="flex flex-col items-center gap-1.5">
          <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ overflow: 'visible' }}>
            <defs>
              <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <path d={tubeBgPath}   fill="rgba(255,255,255,0.05)" />
            <circle cx={cx} cy={bulbY} r={bulbR} fill="rgba(255,255,255,0.05)" />
            <path d={tubeFillPath} fill={fill} opacity="0.85" filter={`url(#glow-${uid})`} style="transition: all 0.6s ease" />
            <circle cx={cx} cy={bulbY} r={bulbR} fill={fill} opacity="0.9" style={{ filter: `drop-shadow(0 0 4px ${glow})` }} />
            <path d={tubeBgPath}   fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
            <circle cx={cx} cy={bulbY} r={bulbR} fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
          </svg>
          <span class="text-white/40 text-xs text-center leading-tight">{label}</span>
        </div>
        <span class={`tabular-nums font-mono ${isLg ? 'text-base font-semibold' : 'text-xs'} ${text}`}>
          {temp}°
        </span>
      </div>
    )
  }

  return (
    <div class="flex flex-col items-center gap-1.5">
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ overflow: 'visible' }}>
        <defs>
          <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={tubeBgPath}   fill="rgba(255,255,255,0.05)" />
        <circle cx={cx} cy={bulbY} r={bulbR} fill="rgba(255,255,255,0.05)" />
        <path d={tubeFillPath} fill={fill} opacity="0.85" filter={`url(#glow-${uid})`} style="transition: all 0.6s ease" />
        <circle cx={cx} cy={bulbY} r={bulbR} fill={fill} opacity="0.9" style={{ filter: `drop-shadow(0 0 4px ${glow})` }} />
        <path d={tubeBgPath}   fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
        <circle cx={cx} cy={bulbY} r={bulbR} fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
      </svg>
      <span class={`tabular-nums font-mono ${isLg ? 'text-base font-semibold' : 'text-xs'} ${text}`}>
        {temp}°
      </span>
      <span class="text-white/40 text-xs text-center leading-tight">
        {label}
      </span>
    </div>
  )
}

// Inline embed inside MetricsPanel (no card wrapper)
export function ThermalsInline({ cpuTemps }) {
  if (!cpuTemps?.package) return null
  const { package: pkg, cores = [] } = cpuTemps

  return (
    <div class="mb-5">
      <h3 class="text-xs font-medium text-white/30 uppercase tracking-wider mb-4">Thermals</h3>
      <div class="flex items-end gap-4 flex-wrap">
        <Thermometer label="Package" temp={pkg.temp} high={pkg.high} crit={pkg.crit} size="sm" />
        <div class="w-px self-stretch bg-white/[0.06] mx-1" />
        {cores.map(c => (
          <Thermometer key={c.id} label={`C${c.id}`} temp={c.temp} high={c.high} crit={c.crit} size="xs" />
        ))}
      </div>
    </div>
  )
}

// Standalone glass-card panel — compact=true for 1/3-column, false for full-width
export function ThermalsPanel({ cpuTemps, compact = false }) {
  if (!cpuTemps?.package) return null
  const { package: pkg, cores = [] } = cpuTemps

  const pkgSize  = compact ? 'sm' : 'lg'
  const coreSize = compact ? 'xs' : 'sm'
  const coreLabel = (c) => compact ? `C${c.id}` : `Core ${c.id}`

  return (
    <div class="glass-card p-6">
      <h2 class="text-lg font-medium text-white mb-6">Thermals</h2>
      <div class="flex items-end justify-center gap-4 sm:gap-6 flex-wrap">
        <Thermometer label="Package" temp={pkg.temp} high={pkg.high} crit={pkg.crit} size={pkgSize} />
        <div class="w-px self-stretch bg-white/[0.06]" />
        <div class={`flex items-end flex-wrap justify-center ${compact ? 'gap-3' : 'gap-4 sm:gap-6'}`}>
          {cores.map(c => (
            <Thermometer key={c.id} label={coreLabel(c)} temp={c.temp} high={c.high} crit={c.crit} size={coreSize} />
          ))}
        </div>
      </div>
    </div>
  )
}
