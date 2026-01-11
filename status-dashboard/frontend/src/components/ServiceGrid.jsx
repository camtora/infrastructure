import { StatusCard } from './StatusCard'

export function ServiceGrid({ services }) {
  // Group services by category
  const publicServices = services.filter(s => s.category === 'public')
  const protectedServices = services.filter(s => s.category === 'protected')
  const apiServices = services.filter(s => s.category === 'api')

  return (
    <div class="space-y-8">
      {publicServices.length > 0 && (
        <section>
          <h2 class="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-blue-500"></span>
            Public Services
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {publicServices.map(service => (
              <StatusCard key={service.name} service={service} />
            ))}
          </div>
        </section>
      )}

      {protectedServices.length > 0 && (
        <section>
          <h2 class="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-purple-500"></span>
            Protected Services
            <span class="text-sm font-normal text-gray-400">(require login)</span>
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {protectedServices.map(service => (
              <StatusCard key={service.name} service={service} />
            ))}
          </div>
        </section>
      )}

      {apiServices.length > 0 && (
        <section>
          <h2 class="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-500"></span>
            API Services
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {apiServices.map(service => (
              <StatusCard key={service.name} service={service} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
