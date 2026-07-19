"use client"

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface AvatarWithInitialsProps {
  /** Image URL — omit or leave null to always show initials. */
  src?: string | null
  /** Full display name, used both for alt text and to derive initials. */
  name: string
  size?: "default" | "sm" | "lg"
  className?: string
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Avatar with an automatic initials fallback derived from `name` — the
 * image (when present) loads over it, and Radix's AvatarFallback already
 * handles the load-failure/load-pending states, so no manual onError
 * wiring is needed here.
 */
export function AvatarWithInitials({ src, name, size = "default", className }: AvatarWithInitialsProps) {
  return (
    <Avatar size={size} className={className}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback className={cn("bg-accent-subtle text-accent-text font-medium")}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
