"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  className?: string
  size?: "sm" | "md"
}

function subscribeNoop() {
  return () => {}
}

/**
 * True once mounted on the client, false during SSR/first paint — avoids
 * the classic theme-toggle hydration mismatch (server never knows the
 * real theme) without a setState-in-effect, which eslint-plugin-react-hooks
 * v7's react-hooks/set-state-in-effect rule now flags.
 */
function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  )
}

/**
 * Dark / light mode toggle button. Uses next-themes to persist preference
 * in localStorage under 'aegis:dark-mode'.
 *
 * Placed in the employee and admin portal topbars (right side).
 */
export function ThemeToggle({ className, size = "md" }: ThemeToggleProps) {
  const mounted = useHasMounted()
  const { theme, setTheme } = useTheme()

  function toggleTheme() {
    const root = document.documentElement
    root.style.transition = "background-color 200ms, color 200ms, border-color 200ms"
    setTheme(theme === "dark" ? "light" : "dark")
    setTimeout(() => {
      root.style.transition = ""
    }, 200)
  }

  if (!mounted) {
    return (
      <div
        className={cn(size === "sm" ? "w-7 h-7" : "w-9 h-9", "rounded-lg bg-bg-secondary animate-pulse", className)}
        aria-hidden="true"
      />
    )
  }

  const isDark = theme === "dark"

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "inline-flex items-center justify-center rounded-lg",
        "text-text-secondary",
        "transition-all duration-[var(--duration-normal)]",
        "hover:bg-bg-secondary hover:text-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        "active:scale-95",
        size === "sm" ? "w-7 h-7" : "w-9 h-9",
        className
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? (
        <Sun className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} aria-hidden="true" />
      ) : (
        <Moon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} aria-hidden="true" />
      )}
    </button>
  )
}
