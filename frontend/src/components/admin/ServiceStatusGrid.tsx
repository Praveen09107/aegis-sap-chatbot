"use client"

import { useMemo } from "react"
import { ServiceTile } from "./ServiceTile"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { ServiceHealth } from "@/types"

interface ServiceStatusGridProps {
  services: ServiceHealth[]
  isLoading?: boolean
  onServiceClick: (service: ServiceHealth) => void
}

// Static category groupings — ordered for display, matching DOCKER_SERVICES
// in src/lib/constants.ts exactly (7 groups, 19 services).
const SERVICE_CATEGORIES: { label: string; names: string[] }[] = [
  { label: "Infrastructure", names: ["aegis-nginx", "aegis-keycloak", "aegis-vault"] },
  { label: "Application", names: ["aegis-fastapi", "aegis-arq"] },
  { label: "AI models", names: ["aegis-ollama-main", "aegis-ollama-judge", "aegis-ollama-vision", "aegis-bge", "aegis-deberta"] },
  { label: "Vector / search", names: ["aegis-qdrant", "aegis-opensearch"] },
  { label: "Database", names: ["aegis-postgres-primary", "aegis-postgres-replica", "aegis-pgbouncer"] },
  { label: "Cache / queue", names: ["aegis-redis-session", "aegis-redis-queue"] },
  { label: "Monitoring", names: ["aegis-prometheus", "aegis-grafana"] },
]

/**
 * Categorised grid of all 19 Docker service tiles.
 * Groups services by logical category with section headers. A service
 * missing from the live response (not yet checked, or the checker itself is
 * down) renders as "unknown" rather than being silently omitted.
 */
export function ServiceStatusGrid({ services, isLoading, onServiceClick }: ServiceStatusGridProps) {
  const serviceMap = useMemo(() => {
    const map = new Map<string, ServiceHealth>()
    for (const svc of services) map.set(svc.name, svc)
    return map
  }, [services])

  if (isLoading) {
    return (
      <div className="space-y-6">
        {SERVICE_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <Skeleton className="h-2.5 w-28 mb-3" />
            <div className={cn("grid gap-3", cat.names.length <= 3 ? "grid-cols-3" : "grid-cols-5")}>
              {cat.names.map((name) => (
                <Skeleton key={name} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6" role="list" aria-label="Docker service statuses">
      {SERVICE_CATEGORIES.map((category) => {
        const categoryServices: ServiceHealth[] = category.names.map(
          (name) =>
            serviceMap.get(name) ?? {
              name,
              container_name: name,
              status: "unknown",
              response_time_ms: null,
              last_checked_at: new Date().toISOString(),
            }
        )

        const gridCols = categoryServices.length <= 3 ? "grid-cols-3" : categoryServices.length === 4 ? "grid-cols-4" : "grid-cols-5"

        return (
          <div key={category.label} role="group" aria-label={category.label}>
            <p className="section-label mb-2.5">{category.label}</p>
            <div className={cn("grid gap-3", gridCols)}>
              {categoryServices.map((service) => (
                <ServiceTile key={service.name} service={service} onClick={onServiceClick} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
