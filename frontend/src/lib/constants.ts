/**
 * AEGIS Frontend Constants
 * Single source of truth for all numeric/string constants.
 * Never hardcode these values in component files.
 */

/**
 * Organization name — the single source of truth every branding touchpoint
 * reads from (AMENDMENT_GENERALIZATION_FRONTEND.md). Never hardcode a
 * company name in a component; import orgName instead.
 */
export const orgName = process.env.NEXT_PUBLIC_ORG_NAME || "Your Company"

// ── Layout dimensions ──
export const LAYOUT = {
  EMPLOYEE_TOPBAR_HEIGHT: 52,
  EMPLOYEE_SIDEBAR_WIDTH: 180,
  EMPLOYEE_SOURCE_PANEL_WIDTH: 210,
  EMPLOYEE_SOURCE_PANEL_ICON_WIDTH: 48,
  EMPLOYEE_COMPOSE_HEIGHT: 64,
  ADMIN_TOPBAR_HEIGHT: 52,
  ADMIN_SIDEBAR_WIDTH: 220,
  ADMIN_NAV_ITEM_HEIGHT: 40,
  ADMIN_METRIC_CARD_HEIGHT: 100,
  MIN_VIEWPORT_WIDTH: 1280,
  OPTIMAL_VIEWPORT_WIDTH: 1440,
} as const

// ── Timing and polling ──
export const TIMING = {
  ADMIN_POLL_INTERVAL_MS: 30_000,
  WS_RECONNECT_DELAY_MS: 3_000,
  WS_PING_INTERVAL_MS: 30_000,
  WS_PONG_TIMEOUT_MS: 10_000,
  SEARCH_DEBOUNCE_MS: 300,
  CONFIG_SAVE_DEBOUNCE_MS: 500,
  TOAST_DURATION_MS: 4_000,
  TOKEN_REFRESH_MS: 720_000, // 12min — JWT silent refresh
  ANIMATION_FAST_MS: 100,
  ANIMATION_NORMAL_MS: 150,
  ANIMATION_SLOW_MS: 250,
  ANIMATION_SLOWER_MS: 400,
  ONBOARDING_STEP_TRANSITION_MS: 300,
} as const

// ── Data limits ──
export const LIMITS = {
  MAX_SESSION_SIDEBAR_RECENT: 30,
  MAX_SESSION_SEARCH_RESULTS: 50,
  MAX_ADMIN_TABLE_PAGE_SIZE: 50,
  MAX_SCREENSHOT_BYTES: 10 * 1024 * 1024,
  MAX_DOCUMENT_BYTES: 50 * 1024 * 1024,
  MAX_SCREENSHOT_DIMENSION: 4096,
  ONBOARDING_TOTAL_STEPS: 5,
  MAX_COMMAND_PALETTE_RESULTS: 8,
  MAX_RECENT_COMMANDS: 5,
  MAX_SESSION_EXPORT_MESSAGES: 500,
  ENTITY_CHIP_TOOLTIP_DELAY_MS: 500,
} as const

// ── localStorage keys ──
// All keys prefixed with "aegis:" to avoid collision with other apps
export const STORAGE_KEYS = {
  DARK_MODE: "aegis:dark-mode",
  PANEL_COLLAPSED: "aegis:panel-collapsed",
  ONBOARDING_COMPLETE: "aegis:onboarding-complete",
  ONBOARDING_STEP: "aegis:onboarding-step",
  PINNED_SESSIONS: "aegis:pinned-sessions",
  COMMAND_PALETTE_HISTORY: "aegis:cmd-history",
  SESSION_SEARCH_HISTORY: "aegis:search-history",
  ADMIN_TABLE_COLUMN_PREFS: "aegis:table-columns",
} as const

// ── Backend URLs (client-side access via NEXT_PUBLIC env vars) ──
export const BACKEND = {
  API_BASE: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  WS_BASE: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000",
  WS_CHAT_PATH: "/ws/chat",
} as const

// ── Feature flags ──
export const FEATURES = {
  DARK_MODE: process.env.NEXT_PUBLIC_DARK_MODE_ENABLED !== "false",
  ONBOARDING: process.env.NEXT_PUBLIC_ONBOARDING_ENABLED !== "false",
  PDF_EXPORT: process.env.NEXT_PUBLIC_PDF_EXPORT_ENABLED !== "false",
  COMMAND_PALETTE: process.env.NEXT_PUBLIC_COMMAND_PALETTE_ENABLED !== "false",
} as const

// ── Confidence thresholds (mirror backend IMPL_17 values) ──
export const CONFIDENCE = {
  GREEN_THRESHOLD: 0.85,
  AMBER_THRESHOLD: 0.7,
  FRESHNESS_WARN_DAYS: 35,
  FRESHNESS_CRIT_DAYS: 70,
} as const

// ── Keyboard shortcuts ──
// Format: modifier+key (e.g., 'meta+k', 'ctrl+/', 'escape')
export const SHORTCUTS = {
  COMMAND_PALETTE: "meta+k",
  NEW_CHAT: "meta+n",
  SEARCH_SESSIONS: "meta+f",
  SHORTCUTS_OVERLAY: "meta+/",
  CLOSE_PANEL: "escape",
  SEND_MESSAGE: "enter",
  NEWLINE: "shift+enter",
  REVIEW_NEXT: "j",
  REVIEW_PREV: "k",
  REVIEW_APPROVE: "a",
  REVIEW_SKIP: "x",
} as const

// ── Admin analytics date ranges ──
export const ANALYTICS_RANGES = [
  { label: "7 days", value: "7d", days: 7 },
  { label: "30 days", value: "30d", days: 30 },
  { label: "90 days", value: "90d", days: 90 },
  { label: "All time", value: "all", days: null },
] as const

// ── Admin navigation items ──
export const ADMIN_NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "LayoutDashboard" },
  { label: "Documents", href: "/admin/documents", icon: "FileText" },
  { label: "Registry", href: "/admin/registry", icon: "Link" },
  { label: "Config snapshot", href: "/admin/config-snapshot", icon: "Settings" },
  { label: "Knowledge gaps", href: "/admin/knowledge-gaps", icon: "Search" },
  { label: "Audit trail", href: "/admin/audit-trail", icon: "ClipboardList" },
  { label: "Review queue", href: "/admin/review-queue", icon: "CheckSquare" },
  { label: "Tickets", href: "/admin/tickets", icon: "Ticket" },
  { label: "System health", href: "/admin/system-health", icon: "Activity" },
  { label: "Analytics", href: "/admin/analytics", icon: "BarChart2" },
] as const

// ── Docker service names (for system health page) ──
export const DOCKER_SERVICES = [
  "aegis-nginx",
  "aegis-keycloak",
  "aegis-vault",
  "aegis-fastapi",
  "aegis-arq",
  "aegis-ollama-main",
  "aegis-ollama-judge",
  "aegis-ollama-vision",
  "aegis-bge",
  "aegis-deberta",
  "aegis-qdrant",
  "aegis-opensearch",
  "aegis-postgres-primary",
  "aegis-postgres-replica",
  "aegis-pgbouncer",
  "aegis-redis-session",
  "aegis-redis-queue",
  "aegis-prometheus",
  "aegis-grafana",
] as const

// ── SAP module labels ──
export const SAP_MODULES = {
  FI: "Financial Accounting",
  MM: "Materials Management",
  SD: "Sales & Distribution",
  HR: "Human Resources",
  PP: "Production Planning",
  CO: "Controlling",
  BASIS: "SAP Basis",
} as const
