/**
 * AEGIS Drawer Component
 *
 * A slide-in side panel for detail views, confirmations, and secondary
 * content. Built on top of shadcn Sheet (Radix Dialog).
 *
 * Used in: ticket detail view, document preview, config change history,
 * audit trail session replay — all slide in from the right.
 *
 * @example
 * <Drawer
 *   open={ticketOpen}
 *   onOpenChange={setTicketOpen}
 *   title="Ticket #TKT-0042"
 *   description="VL150 delivery error — reported by r.suresh1"
 *   width="lg"
 * >
 *   <TicketDetailContent ticket={selectedTicket} />
 * </Drawer>
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type DrawerWidth = "sm" | "md" | "lg" | "xl"

const WIDTH_CLASSES: Record<DrawerWidth, string> = {
  sm: "sm:max-w-sm", // 384px — narrow detail panels
  md: "sm:max-w-md", // 448px — default detail view
  lg: "sm:max-w-lg", // 512px — wider detail with forms
  xl: "sm:max-w-xl", // 576px — full ticket detail
}

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  width?: DrawerWidth
  children: React.ReactNode
  /** Content rendered in the drawer footer (e.g., action buttons) */
  footer?: React.ReactNode
  className?: string
}

export function Drawer({ open, onOpenChange, title, description, width = "md", children, footer, className }: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("flex flex-col gap-0 p-0", "bg-bg-card border-l border-border-primary", WIDTH_CLASSES[width], className)}
      >
        {/* Header */}
        <SheetHeader className="flex flex-row items-start justify-between gap-4 px-5 py-4 border-b border-border-primary shrink-0">
          <div className="space-y-1 min-w-0">
            <SheetTitle className="text-base font-semibold text-text-primary truncate">{title}</SheetTitle>
            {description && <SheetDescription className="text-sm text-text-secondary leading-snug">{description}</SheetDescription>}
          </div>

          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0 mt-0.5" aria-label="Close drawer">
              <X className="w-4 h-4" />
            </Button>
          </SheetClose>
        </SheetHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">{children}</div>

        {/* Optional footer */}
        {footer && <div className="shrink-0 border-t border-border-primary px-5 py-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  )
}
