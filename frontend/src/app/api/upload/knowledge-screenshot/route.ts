import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://aegis-fastapi:8000";

// Streams the multipart body straight to the backend rather than buffering
// it first — matches the existing /api/upload/document and
// /api/upload/screenshot routes' own pattern, not the catch-all
// /api/proxy/[...path] route (reserved for JSON bodies per that route's own
// doc comment). Maps to the real
// backend/app/handlers/knowledge_screenshots_handler.py's
// "/api/admin/knowledge-screenshots/upload" route.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });

  const response = await fetch(`${BACKEND}/api/admin/knowledge-screenshots/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": request.headers.get("content-type") || "",
    },
    body: request.body,
    // @ts-expect-error — duplex is required by undici for streaming request
    // bodies but not yet reflected in the DOM lib's RequestInit type.
    duplex: "half",
  });

  const data = await response.json().catch(() => null);
  return NextResponse.json(data, { status: response.status });
}

export const dynamic = "force-dynamic";
