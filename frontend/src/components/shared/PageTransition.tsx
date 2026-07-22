"use client"

import { motion } from "motion/react"
import { PAGE_TRANSITION } from "@/lib/animations"

interface PageTransitionProps {
  children: React.ReactNode
  /** Key should match the route for AnimatePresence to detect changes */
  layoutKey?: string
}

/**
 * Wraps page content in a subtle entrance animation.
 * Use inside admin page.tsx files if you want per-page transitions.
 *
 * NOTE: This component is OPTIONAL. Most admin pages look fine without
 * explicit page-level transitions since the content loads progressively
 * via Suspense + loading.tsx. Only add it where the page content is
 * rendered fully synchronously.
 *
 * Reduced motion is handled globally by the root layout's
 * <MotionConfig reducedMotion="user"> — no manual check needed here.
 *
 * @example
 * // In an admin page.tsx that doesn't use Suspense:
 * export default function AdminXxxPage() {
 *   return (
 *     <PageTransition>
 *       <AdminPageWrapper>...</AdminPageWrapper>
 *     </PageTransition>
 *   )
 * }
 */
export function PageTransition({ children, layoutKey }: PageTransitionProps) {
  return (
    <motion.div key={layoutKey} variants={PAGE_TRANSITION} initial="hidden" animate="visible" exit="exit">
      {children}
    </motion.div>
  )
}
