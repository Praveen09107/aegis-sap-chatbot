"use client"

import { useEffect, useCallback, useRef } from "react"

type ShortcutHandler = (event: KeyboardEvent) => void

interface Shortcut {
  key: string
  /** ctrl or meta (cmd on Mac) */
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  /** Prevent default browser action */
  preventDefault?: boolean
  /** Do not fire when focus is inside an input/textarea */
  ignoreInInput?: boolean
  handler: ShortcutHandler
}

/**
 * Registers global keyboard shortcuts. Handles both macOS (meta/cmd) and
 * Windows (ctrl) conventions.
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: 'k', meta: true, preventDefault: true, handler: () => setCommandPaletteOpen(true) },
 *   { key: 'Escape', handler: () => setCommandPaletteOpen(false) },
 * ])
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  // Use ref to always have current shortcuts without re-registering listeners.
  // Synced in an effect (not during render) — mutating a ref while rendering
  // is flagged by eslint-plugin-react-hooks v7's react-hooks/refs rule.
  const shortcutsRef = useRef(shortcuts)
  useEffect(() => {
    shortcutsRef.current = shortcuts
  })

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    for (const shortcut of shortcutsRef.current) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
      if (!keyMatch) continue

      // meta:true means "Cmd or Ctrl" (cross-platform equivalence). ctrl:true
      // means Ctrl specifically, independent of platform — it must NOT also
      // be rejected by metaMatch's "no modifier" branch, or a ctrl-only
      // shortcut (meta unset) becomes untriggerable since pressing Ctrl
      // would fail metaMatch's !event.ctrlKey check.
      const metaMatch = shortcut.meta
        ? event.metaKey || event.ctrlKey
        : shortcut.ctrl
          ? true
          : !event.metaKey && !event.ctrlKey
      const ctrlMatch = shortcut.ctrl ? event.ctrlKey : true
      const shiftMatch = shortcut.shift !== undefined ? event.shiftKey === shortcut.shift : true
      const altMatch = shortcut.alt !== undefined ? event.altKey === shortcut.alt : !event.altKey

      if (!metaMatch || !ctrlMatch || !shiftMatch || !altMatch) continue

      // Skip if focus is in an input element (unless explicitly allowed).
      // event.target is typed as EventTarget, not guaranteed to be an
      // Element (e.g. a synthetically dispatched event with no real focus
      // target) — guard before calling Element-only methods like closest().
      if (shortcut.ignoreInInput !== false && event.target instanceof Element) {
        const target = event.target as HTMLElement
        const isInInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.contentEditable === "true" ||
          target.closest('[role="textbox"]') !== null
        if (isInInput) continue
      }

      if (shortcut.preventDefault) event.preventDefault()
      shortcut.handler(event)
      break
    }
  }, [])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}
