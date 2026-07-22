"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Loader2, Eye, EyeOff } from "lucide-react"
import { loginWithCredentials, isAuthenticated, getUserRole } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { orgName } from "@/lib/constants"

/**
 * Validates a `redirect` query param before using it as a post-login
 * destination — never redirect to an attacker-controlled absolute URL.
 * Fixed (2026-07-22): this param has been set by proxy.ts's own
 * middleware (unauthenticated page visits) since F03, but nothing ever
 * read it — every login always landed on the role-based default,
 * silently dropping wherever the user actually came from.
 *
 * Must be a same-origin relative path: starts with exactly one `/`, never
 * `//` (protocol-relative — e.g. `//evil.com` — browsers treat this as an
 * absolute URL to a different host) and never contains a scheme.
 */
function getSafeRedirectPath(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith("/") || raw.startsWith("//")) return null
  if (raw.includes(":")) return null
  return raw
}

/**
 * useSearchParams() requires a Suspense boundary during static generation
 * (Next.js 16 bails the whole page out to client-only rendering otherwise —
 * confirmed live: `next build` fails prerendering /login without this).
 * Split into an inner form component + a thin Suspense-wrapped default
 * export, rather than the whole page falling back to CSR-only.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-secondary" />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = getSafeRedirectPath(searchParams.get("redirect"))

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
      const role = getUserRole()
      router.replace(redirectTo ?? (role === "it-admin" ? "/admin/dashboard" : "/"))
    }
  }, [router, redirectTo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return

    setError(null)
    setIsLoading(true)

    const result = await loginWithCredentials(username.trim(), password)
    setIsLoading(false)

    if (result.success) {
      const role = getUserRole()
      router.push(redirectTo ?? (role === "it-admin" ? "/admin/dashboard" : "/"))
    } else {
      setError(result.error ?? "Login failed. Please check your credentials.")
      setPassword("")
    }
  }

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-bg-card border border-border-primary rounded-2xl p-8 shadow-lg">
          {/* Logo + branding */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4 shadow-md">
              <Image
                src="/logo.svg"
                alt={orgName}
                width={32}
                height={32}
                className="object-contain brightness-0 invert"
                onError={(e) => {
                  // Fallback if logo not yet provided
                  const target = e.target as HTMLImageElement
                  target.style.display = "none"
                  target.nextElementSibling?.classList.remove("hidden")
                }}
              />
              <span className="hidden text-white font-bold text-lg">A</span>
            </div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">AEGIS</h1>
            <p className="text-sm text-text-tertiary mt-1">SAP Intelligence · {orgName}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="username" className="block text-sm font-medium text-text-secondary">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your SAP username"
                autoComplete="username"
                autoFocus
                required
                disabled={isLoading}
                className={cn(
                  "w-full h-10 px-3 rounded-lg text-sm",
                  "bg-bg-secondary border border-border-primary",
                  "text-text-primary placeholder:text-text-tertiary",
                  "transition-colors duration-150",
                  "focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                  className={cn(
                    "w-full h-10 px-3 pr-10 rounded-lg text-sm",
                    "bg-bg-secondary border border-border-primary",
                    "text-text-primary placeholder:text-text-tertiary",
                    "transition-colors duration-150",
                    "focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error state */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 bg-danger-bg border border-danger-border rounded-lg"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-danger mt-1.5 flex-shrink-0" />
                <p className="text-sm text-danger-text leading-relaxed">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password.trim()}
              className={cn(
                "w-full h-10 rounded-lg text-sm font-medium",
                "bg-accent text-white",
                "transition-all duration-150",
                "hover:bg-accent-hover",
                "active:scale-[0.98]",
                "focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                "flex items-center justify-center gap-2"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-text-tertiary mt-6">Internal tool — authorised users only</p>
      </div>
    </div>
  )
}
