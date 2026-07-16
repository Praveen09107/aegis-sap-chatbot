import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://aegis-fastapi:8000";

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const token = request.cookies.get("access_token")?.value;
  if (!token) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });

  const { path } = await params;
  const url = `${BACKEND}/${path.join("/")}${request.nextUrl.search}`;
  const body = request.method !== "GET" ? await request.text() : undefined;

  const resp = await fetch(url, {
    method: request.method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": request.headers.get("content-type") || "application/json",
    },
    body,
  });

  return new NextResponse(await resp.text(), {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("content-type") || "application/json" },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
