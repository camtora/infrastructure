export function FailoverBanner() {
  return (
    <div class="bg-yellow-600 text-yellow-100 py-4 px-6">
      <div class="max-w-7xl mx-auto flex items-center gap-4">
        <svg class="w-8 h-8 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h2 class="font-bold text-lg">camerontora.ca services are currently offline</h2>
          <p class="text-yellow-200">
            You've been redirected to this status page. We're working on restoring services.
            Last known status shown below.
          </p>
        </div>
      </div>
    </div>
  )
}
