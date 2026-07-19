"use client"

import { useState, useCallback } from "react"
import { STORAGE_KEYS, LIMITS } from "@/lib/constants"

/**
 * Manages CommandPalette open state and command history.
 *
 * The open/close state is kept locally in layouts. Once uiStore (F08) is
 * created, wire this to uiStore.commandPaletteOpen.
 *
 * @example
 * // In employee layout:
 * const { isOpen, open, close, toggle } = useCommandPalette()
 * useKeyboardShortcuts([{ key: 'k', meta: true, handler: toggle, preventDefault: true }])
 * <CommandPalette open={isOpen} onOpenChange={close} />
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  return { isOpen, open, close, toggle }
}

/**
 * Tracks recently used commands for the "Recent" section in CommandPalette.
 */
export function useCommandHistory() {
  function getHistory(): string[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.COMMAND_PALETTE_HISTORY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  function addToHistory(commandId: string) {
    const history = getHistory().filter((id) => id !== commandId)
    const next = [commandId, ...history].slice(0, LIMITS.MAX_RECENT_COMMANDS)
    try {
      localStorage.setItem(STORAGE_KEYS.COMMAND_PALETTE_HISTORY, JSON.stringify(next))
    } catch {
      // localStorage full — ignore
    }
  }

  return { getHistory, addToHistory }
}
