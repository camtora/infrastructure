export function FailoverBanner() {
  return (
    <div class="bg-gradient-to-r from-amber-600/90 to-amber-500/90 backdrop-blur-sm border-b border-amber-400/50">
      <div class="max-w-7xl mx-auto py-4 px-6 flex items-center gap-4">
        <svg class="w-7 h-7 flex-shrink-0 text-amber-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h2 class="font-semibold text-white text-sm sm:text-base">
            camerontora.ca services are currently offline
          </h2>
          <p class="text-amber-100/80 text-xs sm:text-sm">
            You've been redirected to this status page. We're working on restoring services.
          </p>
        </div>
      </div>
    </div>
  )
}
