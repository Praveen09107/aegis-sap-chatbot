"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { orgName } from "@/lib/constants"

interface LoadingScreenProps {
  /** Minimum display time in ms. Prevents flash for fast loads. */
  minDurationMs?: number
  label?: string
}

/**
 * Full-page loading screen shown during initial auth check and route
 * transitions. Shows the org's logo with a subtle pulse animation.
 */
export function LoadingScreen({ minDurationMs = 400, label = "Loading AEGIS..." }: LoadingScreenProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), minDurationMs)
    return () => clearTimeout(timer)
  }, [minDurationMs])

  if (!visible) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-modal",
        "flex flex-col items-center justify-center gap-6",
        "bg-bg-primary",
        "animate-fade-in"
      )}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      {/* Logo mark */}
      <div className="relative w-14 h-14">
        <div
          className={cn(
            "w-14 h-14 rounded-2xl bg-accent",
            "flex items-center justify-center",
            "shadow-lg animate-pulse-subtle"
          )}
        >
          <Image
            src="/logo.svg"
            alt={orgName}
            width={36}
            height={36}
            className="object-contain brightness-0 invert"
            priority
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = "none"
              target.nextElementSibling?.classList.remove("hidden")
            }}
          />
          <span className="hidden text-white font-bold text-xl">A</span>
        </div>
      </div>

      {/* Brand */}
      <div className="text-center">
        <p className="text-lg font-bold text-text-primary tracking-tight">AEGIS</p>
        <p className="text-sm text-text-tertiary mt-0.5">SAP Intelligence</p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-subtle"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      <span className="sr-only">{label}</span>
    </div>
  )
}
