"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

interface ConfirmDialogProps {
  /** The element that triggers the dialog (e.g., a delete button) */
  trigger: React.ReactNode
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** Visual weight of the confirm action */
  variant?: "destructive" | "default"
  /** Called when user confirms. Can be async. */
  onConfirm: () => void | Promise<void>
  /** Whether the dialog is currently open (controlled mode) */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Confirmation dialog for destructive or significant admin actions.
 * RULE: every delete, deprecate, bulk-action, or irreversible operation
 * must use this (FRONTEND_MASTER_REFERENCE.md Rule 5).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault()
    setIsLoading(true)
    try {
      await onConfirm()
      onOpenChange?.(false)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>

      <AlertDialogContent className="bg-bg-card border-border-primary shadow-xl max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-text-primary text-lg font-semibold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-text-secondary text-sm leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            className={cn(
              "border border-border-primary bg-transparent text-text-primary",
              "hover:bg-bg-secondary",
              "h-9 px-4 text-sm font-medium rounded-lg",
              "transition-colors duration-[var(--duration-normal)]"
            )}
          >
            {cancelLabel}
          </AlertDialogCancel>

          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              "h-9 px-4 text-sm font-medium rounded-lg",
              "inline-flex items-center gap-2",
              "transition-all duration-[var(--duration-normal)]",
              "disabled:opacity-50 disabled:pointer-events-none",
              variant === "destructive" ? "bg-danger text-white hover:bg-danger/90" : "bg-accent text-white hover:bg-accent-hover"
            )}
          >
            {isLoading && <Spinner size="xs" color="white" />}
            {isLoading ? "Processing..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
