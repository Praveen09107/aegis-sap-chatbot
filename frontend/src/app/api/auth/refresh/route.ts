import { NextRequest, NextResponse } from "next/server";

interface KeycloakRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function POST(request: NextRequest) {
  const refresh_token = request.cookies.get("refresh_token")?.value;
  if (!refresh_token) return NextResponse.json({ error: "No refresh token" }, { status: 401 });

  const KEYCLOAK_URL = `${process.env.KEYCLOAK_INTERNAL_URL}/realms/${process.env.KEYCLOAK_REALM || "aegis-realm"}/protocol/openid-connect/token`;
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
    const data: KeycloakRefreshResponse = await resp.json();
    const response = NextResponse.json({ ok: true });
    const secure = process.env.NODE_ENV === "production";

    response.cookies.set("access_token", data.access_token, {
      httpOnly: true, secure, sameSite: "lax", maxAge: data.expires_in, path: "/",
    });
    // Keycloak's refresh grant rotates the refresh token by default (realm
    // "Revoke Refresh Token" setting) — the old one may already be invalid
    // server-side, so the rotated value must be persisted, not dropped.
    response.cookies.set("refresh_token", data.refresh_token, {
      httpOnly: true, secure, sameSite: "lax", maxAge: 28800, path: "/",
    });

    try {
      const payload = JSON.parse(Buffer.from(data.access_token.split(".")[1], "base64").toString("utf-8"));
      const roles: string[] = payload?.realm_access?.roles || [];
      response.cookies.set("user_role",
        roles.includes("it-admin") ? "it-admin" : "employee",
        { httpOnly: false, sameSite: "lax", maxAge: data.expires_in, path: "/" });
    } catch {}

    return response;
  } catch {
    return NextResponse.json({ error: "Network error" }, { status: 500 });
  }
}
