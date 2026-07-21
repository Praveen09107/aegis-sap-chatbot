import { type LucideIcon } from "lucide-react"
import { AdminPageWrapper } from "./AdminPageWrapper"
import { EmptyState } from "./EmptyState"
import { AdminPageHeader } from "./AdminPageHeader"

interface AdminEmptyPageProps {
  title: string
  icon?: LucideIcon
  emptyTitle: string
  emptyDescription?: string
  action?: React.ReactNode
}

/**
 * Full admin page empty state — used when a page has no data at all yet.
 * Combines AdminPageHeader + EmptyState in the standard layout.
 */
export function AdminEmptyPage({ title, icon, emptyTitle, emptyDescription, action }: AdminEmptyPageProps) {
  return (
    <AdminPageWrapper>
      <AdminPageHeader title={title} />
      <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} action={action} variant="page" />
    </AdminPageWrapper>
  )
}
