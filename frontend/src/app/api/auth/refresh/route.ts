import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const refresh_token = request.cookies.get("refresh_token")?.value;
  if (!refresh_token) return NextResponse.json({ error: "No refresh token" }, { status: 401 });

  const KEYCLOAK_URL = `${process.env.KEYCLOAK_INTERNAL_URL}/realms/aegis-realm/protocol/openid-connect/token`;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.KEYCLOAK_CLIENT_ID || "aegis-chat",
    client_secret: process.env.KEYCLOAK_CLIENT_SECRET || "",
    refresh_token,
  });

  try {
    const resp = await fetch(KEYCLOAK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!resp.ok) {
      const r = NextResponse.json({ error: "Refresh failed" }, { status: 401 });
      ["access_token", "refresh_token", "user_role"].forEach(n => r.cookies.delete(n));
      return r;
    }
    const data = await resp.json();
    const response = NextResponse.json({ ok: true });
    response.cookies.set("access_token", data.access_token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", maxAge: data.expires_in, path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Network error" }, { status: 500 });
  }
}
