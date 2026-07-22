/**
 * Central motion/react variants for AEGIS.
 * All motion.* components import their variants from here — no inline
 * variant definitions in consuming components. This is what makes visual
 * consistency and global animation adjustments possible.
 *
 * Reduced motion is handled globally via <MotionConfig reducedMotion="user">
 * in the root layout (src/app/layout.tsx) — it automatically strips
 * transform/layout animation (x/y/scale/rotate) while keeping opacity
 * transitions active whenever the OS setting is on. Variants below define
 * both; no per-component reducedMotion branching is needed to get the
 * "opacity-only" behavior FRONTEND_23 requires.
 *
 * Usage:
 *   import { FADE_UP } from '@/lib/animations'
 *   <motion.div variants={FADE_UP} initial="hidden" animate="visible" exit="exit" />
 */

import type { Variants, Transition } from "motion/react"

// ── Shared transitions ────────────────────────────────────────

export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
}

export const EASE_OUT_EXPO: Transition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1],
}

export const EASE_IN_OUT: Transition = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1],
}

// ── Basic entrance variants ────────────────────────────────────

/** Standard fade-in — use for tooltips, popovers, small UI elements */
export const FADE_IN: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "easeIn" } },
}

/** Fade + slide up — use for chat messages, cards, modals entering */
export const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: EASE_OUT_EXPO },
  exit: { opacity: 0, y: 4, transition: { duration: 0.1, ease: "easeIn" } },
}

/** Fade + slide down — use for dropdowns, context menus */
export const FADE_DOWN: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: EASE_OUT_EXPO },
  exit: { opacity: 0, y: -4, transition: { duration: 0.1, ease: "easeIn" } },
}

/** Slide in from right — use for drawers, detail panels */
export const SLIDE_IN_RIGHT: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: EASE_OUT_EXPO },
  exit: { opacity: 0, x: 16, transition: { duration: 0.15, ease: "easeIn" } },
}

/** Slide in from left — use for sidebar items, back navigation */
export const SLIDE_IN_LEFT: Variants = {
  hidden: { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0, transition: EASE_OUT_EXPO },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15, ease: "easeIn" } },
}

/** Scale + fade — use for modals, command palette, badges */
export const SCALE_IN: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: EASE_OUT_EXPO },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.1, ease: "easeIn" } },
}

/** Expand from top — use for notifications, banners, alert bars */
export const EXPAND_DOWN: Variants = {
  hidden: { opacity: 0, height: 0, overflow: "hidden" },
  visible: { opacity: 1, height: "auto", transition: { ...EASE_OUT_EXPO, duration: 0.2 } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.15, ease: "easeIn" } },
}

/** Bulk action bar slide-up from bottom */
export const SLIDE_UP_FROM_BOTTOM: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: SPRING_SNAPPY },
  exit: { opacity: 0, y: 12, transition: { duration: 0.15, ease: "easeIn" } },
}

// ── Page transitions ──────────────────────────────────────────

/**
 * Soft page transition — used by the Next.js layout wrappers.
 * Subtle: just opacity + tiny vertical offset. Admin portal uses this.
 */
export const PAGE_TRANSITION: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "easeIn" } },
}

// ── Stagger containers ────────────────────────────────────────

/**
 * Container that staggers children animation by 40ms.
 * Child components must also have a variants prop.
 *
 * @example
 * <motion.div variants={CONTAINER_STAGGER} initial="hidden" animate="visible">
 *   {items.map(item => (
 *     <motion.div key={item.id} variants={FADE_UP}>{item.label}</motion.div>
 *   ))}
 * </motion.div>
 */
export const CONTAINER_STAGGER: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
}

/** Tighter stagger for dense lists (4 or more items) */
export const CONTAINER_STAGGER_TIGHT: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.01,
    },
  },
}

// ── Onboarding step transitions ───────────────────────────────

/**
 * Direction-aware slide for onboarding step transitions.
 * Pass `custom={direction}` where direction is +1 (forward) or -1 (back).
 *
 * @example
 * const direction = useRef(1)
 * <AnimatePresence mode="wait" custom={direction.current}>
 *   <motion.div
 *     key={stepIndex}
 *     variants={ONBOARDING_STEP}
 *     custom={direction.current}
 *     initial="enter"
 *     animate="center"
 *     exit="exit"
 *   />
 * </AnimatePresence>
 */
export const ONBOARDING_STEP: Variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  }),
}

// ── Chat-specific variants ────────────────────────────────────

/**
 * Chat message bubble entry.
 * User bubble slides from right; AI bubble slides from left.
 * Pass `custom="user"` or `custom="assistant"` to the motion element.
 */
export const CHAT_MESSAGE: Variants = {
  hidden: (role: string) => ({
    opacity: 0,
    x: role === "user" ? 12 : -12,
    y: 4,
  }),
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
}

/**
 * Streaming progress stage transition — used in StreamingProgress component.
 * Fades the stage label in as each stage changes.
 */
export const STREAMING_STAGE: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "easeIn" } },
}

// ── Admin-specific variants ───────────────────────────────────

/** Kanban card while being dragged (rotation handled by DragOverlay) */
export const KANBAN_DRAG_OVERLAY: Variants = {
  hidden: { rotate: 0, scale: 1 },
  visible: { rotate: 2.5, scale: 1.03, transition: SPRING_SNAPPY },
}

/**
 * Gap card sample query expansion.
 * Applied to the `<motion.ul>` containing sample queries.
 * (Height animation — needs `overflow: hidden` on parent)
 */
export const GAP_EXPAND: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
}

// ── Notification / toast variants ─────────────────────────────

/** Toast notification entry/exit — slides in from right, slides out to right */
export const TOAST_SLIDE: Variants = {
  hidden: { opacity: 0, x: 40, scale: 0.96 },
  visible: { opacity: 1, x: 0, scale: 1, transition: SPRING_SNAPPY },
  exit: { opacity: 0, x: 32, scale: 0.96, transition: { duration: 0.15 } },
}

// ── Loading skeleton pulse ─────────────────────────────────────

/**
 * Shimmer animation data for motion/react skeleton elements.
 * Used when shadcn's Skeleton component is not sufficient
 * (e.g., custom chart placeholder shapes).
 */
export const SKELETON_PULSE = {
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
  },
}
