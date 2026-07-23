/**
 * AEGIS Screenshot Serving Proxy
 *
 * Both admin (QuickEntryScreenshot.proxy_url) and employee
 * (ScreenshotReference.url) screenshot fields are real backend-returned
 * relative paths of the exact shape `/api/screenshots/{minio_object_key}`
 * (see backend/app/handlers/knowledge_screenshots_handler.py's
 * `proxy_url` construction and validation_engine.py's `_fetch_screenshot_metadata`),
 * meant to be requested directly by <img> tags from this Next.js origin.
 *
 * A dedicated route (not the /api/proxy/[...path] catch-all) is required
 * specifically because <img src> requests can't carry a custom
 * Authorization header — this route reads the httpOnly access_token
 * cookie the browser sends automatically instead, then adds the Bearer
 * header itself before calling the real backend's internal serving route
 * (backend/app/handlers/knowledge_screenshots_handler.py's serve_router,
 * `/api/screenshots/{object_key:path}`, auth-only, MinIO-backed).
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://aegis-fastapi:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });

  const { path } = await params;

  // Path-traversal guard — object keys are MinIO keys, never allowed to
  // escape the bucket via ".." segments.
  if (path.some((segment) => segment === "..")) {
    return NextResponse.json({ detail: "Invalid screenshot path." }, { status: 400 });
  }

  const objectKey = path.join("/");

  const upstreamResponse = await fetch(`${BACKEND}/api/screenshots/${objectKey}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!upstreamResponse.ok) {
    return NextResponse.json({ detail: "Screenshot not found." }, { status: upstreamResponse.status });
  }

  const contentType = upstreamResponse.headers.get("content-type") ?? "application/octet-stream";
  const cacheControl = upstreamResponse.headers.get("cache-control") ?? "private, max-age=86400";

  return new NextResponse(upstreamResponse.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}

// Reads cookies on every request — must not be statically optimised.
export const dynamic = "force-dynamic";
