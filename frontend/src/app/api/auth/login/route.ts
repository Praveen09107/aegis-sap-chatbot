import { NextRequest, NextResponse } from "next/server";

interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// aegis-chat is a confidential Keycloak client (setup_keycloak.py:
// publicClient: False), so the ROPC token exchange must happen server-side
// — KEYCLOAK_CLIENT_SECRET is never NEXT_PUBLIC_ and must never reach the
// browser bundle. The client posts credentials here instead of to Keycloak
// directly.
export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const KEYCLOAK_URL = `${process.env.KEYCLOAK_INTERNAL_URL}/realms/${process.env.KEYCLOAK_REALM || "aegis-realm"}/protocol/openid-connect/token`;
  const params = new URLSearchParams({
    grant_type: "password",
    client_id: process.env.KEYCLOAK_CLIENT_ID || "aegis-chat",
    client_secret: process.env.KEYCLOAK_CLIENT_SECRET || "",
    username,
    password,
  });

  let data: KeycloakTokenResponse;
  try {
    const resp = await fetch(KEYCLOAK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      return NextResponse.json(
        { success: false, error: e.error_description || "Invalid credentials." },
        { status: 401 }
      );
    }
    data = await resp.json();
  } catch {
    return NextResponse.json({ success: false, error: "Connection error. Please try again." }, { status: 502 });
  }

  const response = NextResponse.json({ success: true });
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set("access_token", data.access_token, {
    httpOnly: true, secure, sameSite: "lax", maxAge: data.expires_in || 900, path: "/",
  });
  response.cookies.set("refresh_token", data.refresh_token, {
    httpOnly: true, secure, sameSite: "lax", maxAge: 28800, path: "/",
  });

  try {
    const payload = JSON.parse(Buffer.from(data.access_token.split(".")[1], "base64").toString("utf-8"));
    const roles: string[] = payload?.realm_access?.roles || [];
    response.cookies.set("user_role",
      roles.includes("it-admin") ? "it-admin" : "employee",
      { httpOnly: false, sameSite: "lax", maxAge: data.expires_in || 900, path: "/" });
  } catch {}

  return response;
}
