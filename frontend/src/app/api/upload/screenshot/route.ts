import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://aegis-fastapi:8000";

// Identical streaming pattern to /api/upload/document — separate route
// because the two map to distinct backend endpoints, not distinct handling.
// Max size (10MB) is enforced by the backend; see LIMITS.MAX_SCREENSHOT_BYTES.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });

  const response = await fetch(`${BACKEND}/api/upload/screenshot`, {
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
