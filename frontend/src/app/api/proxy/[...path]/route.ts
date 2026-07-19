/**
 * AEGIS API Catch-All Proxy Route
 *
 * Routes all frontend API calls to the FastAPI backend, injecting the
 * HttpOnly access_token cookie as a Bearer token.
 *
 * URL pattern: /api/proxy/<backend-path>?<query-params>
 * Forwards to:  <BACKEND_INTERNAL_URL>/<backend-path>?<query-params>
 *
 * No "/api/" prefix is auto-inserted before <backend-path> — the backend's
 * own routers are inconsistently mounted (admin_handler.py sits at bare
 * "/admin", while the Quick Entry routers sit at "/api/admin/...") so the
 * caller (src/lib/api.ts) supplies the exact path segment the backend
 * actually expects; this proxy is a pure passthrough.
 *
 * Handles: GET, POST, PUT, PATCH, DELETE
 * Does NOT handle: WebSocket (separate /api/auth/ws-token + direct WS connection)
 * Does NOT handle: multipart file uploads — those stream through
 *                  /api/upload/document and /api/upload/screenshot instead,
 *                  since arrayBuffer() would fully buffer large files first.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://aegis-fastapi:8000";
const REQUEST_TIMEOUT_MS = 30_000;

// Headers that must NOT be forwarded to the backend
const BLOCKED_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
]);

// Headers that must NOT be forwarded back to the client
const BLOCKED_RESPONSE_HEADERS = new Set([
  "set-cookie", // Backend never sets cookies for the browser — only Next.js does
  "transfer-encoding",
  "content-encoding",
  "content-length",
]);

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });

  const { path } = await params;
  const url = `${BACKEND}/${path.join("/")}${request.nextUrl.search}`;

  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (!BLOCKED_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  });
  forwardHeaders.set("Authorization", `Bearer ${token}`);

  const realIp =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";
  forwardHeaders.set("X-Real-IP", realIp);

  // Binary-safe body passthrough — resp.text() would corrupt uploads/downloads
  // that carry non-UTF8 payloads (e.g. document/screenshot bytes).
  const hasBody = !["GET", "HEAD"].includes(request.method);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(url, {
      method: request.method,
      headers: forwardHeaders,
      body: hasBody ? request.body : undefined,
      // @ts-expect-error — duplex is required by undici for streaming request
      // bodies but not yet reflected in the DOM lib's RequestInit type.
      duplex: hasBody ? "half" : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const responseHeaders = new Headers();
    upstreamResponse.headers.forEach((value, key) => {
      if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });
    if (!responseHeaders.has("Content-Type")) {
      responseHeaders.set("Content-Type", "application/json");
    }

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const error = err as Error;
    if (error.name === "AbortError") {
      return NextResponse.json(
        { detail: "The backend took too long to respond. Please try again." },
        { status: 504 }
      );
    }
    console.error(`[proxy] Backend unreachable: ${request.method} ${url}`, error.message);
    return NextResponse.json(
      { detail: "The service is temporarily unavailable." },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;

// Reads cookies on every request — must not be statically optimised.
export const dynamic = "force-dynamic";
