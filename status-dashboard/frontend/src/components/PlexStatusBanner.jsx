export function PlexStatusBanner({ plexPlatform }) {
  if (!plexPlatform || plexPlatform.indicator === 'none') return null

  const isMinor = plexPlatform.indicator === 'minor'
  const incident = plexPlatform.incidents?.[0]
  const colorClass = isMinor
    ? 'from-amber-600/90 to-amber-500/90 border-amber-400/50'
    : 'from-red-700/90 to-red-600/90 border-red-400/50'

  return (
    <div class={`bg-gradient-to-r ${colorClass} backdrop-blur-sm border-b`}>
      <div class="max-w-7xl mx-auto py-4 px-6 flex items-center gap-4">
        <svg class="w-7 h-7 flex-shrink-0 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h2 class="font-semibold text-white text-sm sm:text-base">
            Plex platform issue: {plexPlatform.description}
          </h2>
          {incident && (
            <p class="text-white/80 text-xs sm:text-sm">
              {incident.name}
              {incident.shortlink && (
                <> — <a href={incident.shortlink} target="_blank" rel="noreferrer" class="underline">details</a></>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
