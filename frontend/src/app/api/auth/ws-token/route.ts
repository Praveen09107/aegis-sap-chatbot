/**
 * Issues the WebSocket authentication token used on /ws/chat?token=<value>.
 *
 * This does NOT exchange the access token for a separate, short-lived
 * WS-specific token — no such backend endpoint exists. Confirmed by reading
 * the real backend: ws_authenticate() (middleware/authentication.py)
 * validates whatever token arrives on ?token= with the exact same RS256
 * JWKS verification, issuer check, and azp check as a normal HTTP request's
 * access_token — there is no separate WS token type or exchange endpoint
 * on the backend to call. This route's real job is just relaying the
 * existing HttpOnly access_token cookie to client-side JS, which can't read
 * HttpOnly cookies directly — the WebSocket connection itself performs the
 * real authentication, server-side, exactly as an HTTP request would.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ ws_token: token });
}

// Reads a cookie on every request — must not be statically optimised.
export const dynamic = "force-dynamic";
