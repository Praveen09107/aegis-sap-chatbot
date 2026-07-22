"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { X, Keyboard } from "lucide-react"
import { cn } from "@/lib/utils"
import { FADE_IN, SCALE_IN } from "@/lib/animations"
import { useAuth } from "@/hooks/useAuth"

interface ShortcutEntry {
  keys: string[]
  description: string
  category: string
}

const EMPLOYEE_SHORTCUTS: ShortcutEntry[] = [
  { keys: ["Enter"], description: "Send message", category: "Chat" },
  { keys: ["Shift", "Enter"], description: "New line in message", category: "Chat" },
  { keys: ["⌘", "N"], description: "New chat session", category: "Chat" },
  { keys: ["⌘", "K"], description: "Open command palette", category: "Navigation" },
  { keys: ["⌘", "/"], description: "Keyboard shortcuts", category: "Navigation" },
  { keys: ["⌘", "F"], description: "Search sessions", category: "Navigation" },
  { keys: ["Esc"], description: "Close overlay / cancel", category: "Navigation" },
]

const ADMIN_SHORTCUTS: ShortcutEntry[] = [
  { keys: ["J"], description: "Next review item", category: "Review Queue" },
  { keys: ["K"], description: "Previous review item", category: "Review Queue" },
  { keys: ["A"], description: "Approve correction", category: "Review Queue" },
  { keys: ["X"], description: "Skip item", category: "Review Queue" },
  { keys: ["⌘", "A"], description: "Select all rows", category: "Admin tables" },
  { keys: ["⌘", "K"], description: "Command palette", category: "Navigation" },
  { keys: ["⌘", "/"], description: "Keyboard shortcuts", category: "Navigation" },
]

/**
 * Full-screen keyboard shortcuts reference overlay. Opened via ⌘/ or the
 * "Keyboard shortcuts" command palette item. Listens for the custom
 * 'aegis:open-shortcuts' event dispatched by CommandPalette.
 */
export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false)
  const { isAdmin } = useAuth()

  // Listen for open event from CommandPalette
  useEffect(() => {
    function handleOpen() {
      setOpen(true)
    }
    document.addEventListener("aegis:open-shortcuts", handleOpen)
    return () => document.removeEventListener("aegis:open-shortcuts", handleOpen)
  }, [])

  // ⌘/ keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === "Escape") {
        setOpen(false)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const shortcuts = isAdmin ? [...EMPLOYEE_SHORTCUTS, ...ADMIN_SHORTCUTS] : EMPLOYEE_SHORTCUTS

  // Group by category
  const grouped = shortcuts.reduce<Record<string, ShortcutEntry[]>>((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = []
    acc[shortcut.category].push(shortcut)
    return acc
  }, {})

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="shortcuts-backdrop"
            variants={FADE_IN}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-overlay bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="shortcuts-panel"
            variants={SCALE_IN}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "z-modal w-full max-w-lg mx-4",
              "bg-bg-card border border-border-primary rounded-xl shadow-xl",
              "overflow-hidden"
            )}
            role="dialog"
            aria-label="Keyboard shortcuts"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
              <div className="flex items-center gap-2.5">
                <Keyboard className="w-4 h-4 text-text-secondary" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-text-primary">Keyboard shortcuts</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center",
                  "text-text-tertiary hover:text-text-primary hover:bg-bg-secondary",
                  "transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                )}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shortcuts grid */}
            <div className="p-5 grid grid-cols-1 gap-5 sm:grid-cols-2 max-h-[70vh] overflow-y-auto">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <h3 className="section-label mb-3">{category}</h3>
                  <div className="space-y-1.5">
                    {items.map((shortcut, i) => (
                      <div key={i} className="flex items-center justify-between gap-4">
                        <span className="text-sm text-text-secondary">{shortcut.description}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {shortcut.keys.map((key, j) => (
                            <kbd
                              key={j}
                              className={cn(
                                "inline-flex items-center justify-center",
                                "bg-bg-tertiary border border-border-secondary",
                                "rounded-md px-2 py-1",
                                "text-xs text-text-secondary font-medium",
                                "min-w-[28px]",
                                "shadow-sm"
                              )}
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
