import { NextRequest, NextResponse } from "next/server";

/**
 * AEGIS Edge Proxy (Next.js 16 renamed "middleware.ts" to "proxy.ts" —
 * middleware.ts still runs but is deprecated, and this file didn't
 * previously exist in the real codebase, so it was built directly on the
 * current convention rather than the one FRONTEND_02_ARCHITECTURE.md's
 * FILE 4 spec'd; the exported function/config shape is otherwise identical.)
 *
 * Routing rules:
 * /login             → Public. If authenticated, redirect to /
 * /onboarding        → Employee only (role: employee)
 * /history           → Employee only
 * /                  → Employee only (chat interface)
 * /admin/*           → IT admin only (role: it-admin)
 * /api/auth/*        → Public (auth routes handle their own validation)
 * /api/*             → Protected (handled by route handlers)
 *
 * Tokens are stored as HttpOnly cookies (set by /api/auth/login and
 * /api/auth/set-token's DELETE handler for logout). Proxy reads the
 * non-HttpOnly user_role cookie for routing decisions — the HttpOnly
 * access_token cookie itself is verified by each API route handler.
 */

const PUBLIC_PATHS = ["/login", "/api/auth"];
const EMPLOYEE_PATHS = ["/", "/history", "/onboarding"];
const ADMIN_PATH_PREFIX = "/admin";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/icons")
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token")?.value;
  const userRole = request.cookies.get("user_role")?.value as
    | "employee"
    | "it-admin"
    | undefined;

  if (!accessToken || !userRole) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith(ADMIN_PATH_PREFIX)) {
    if (userRole !== "it-admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    const response = NextResponse.next();
    response.headers.set("X-Portal", "admin");
    response.headers.set("X-User-Role", userRole);
    return response;
  }

  if (EMPLOYEE_PATHS.some((p) => pathname === p) || pathname.startsWith("/history")) {
    const response = NextResponse.next();
    response.headers.set("X-Portal", "employee");
    response.headers.set("X-User-Role", userRole);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|icons).*)"],
};
