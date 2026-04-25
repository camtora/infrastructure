import { StatusCard } from './StatusCard'

export function ServiceGrid({ services, adminAuth, onRestartContainer }) {
  // Group services by category
  const publicServices = services.filter(s => s.category === 'public')
  const protectedServices = services.filter(s => s.category === 'protected')
  const apiServices = services.filter(s => s.category === 'api')

  return (
    <div class="space-y-10">
      {publicServices.length > 0 && (
        <section>
          <h2 class="text-lg font-medium text-white mb-4 text-center">
            Public Services
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {publicServices.map(service => (
              <StatusCard key={service.name} service={service} adminAuth={adminAuth} onRestart={onRestartContainer} />
            ))}
          </div>
        </section>
      )}

      {protectedServices.length > 0 && (
        <section>
          <h2 class="text-lg font-medium text-white mb-4 text-center">
            Protected Services
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {protectedServices.map(service => (
              <StatusCard key={service.name} service={service} adminAuth={adminAuth} onRestart={onRestartContainer} />
            ))}
          </div>
        </section>
      )}

      {apiServices.length > 0 && (
        <section>
          <h2 class="text-lg font-medium text-white mb-4 text-center">
            API Services
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {apiServices.map(service => (
              <StatusCard key={service.name} service={service} adminAuth={adminAuth} onRestart={onRestartContainer} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
