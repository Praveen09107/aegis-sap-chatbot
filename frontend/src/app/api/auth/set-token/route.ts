import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { access_token, refresh_token, expires_in } = await request.json();
  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set("access_token", access_token, {
    httpOnly: true, secure, sameSite: "lax", maxAge: expires_in || 900, path: "/",
  });
  response.cookies.set("refresh_token", refresh_token, {
    httpOnly: true, secure, sameSite: "lax", maxAge: 28800, path: "/",
  });

  try {
    const payload = JSON.parse(atob(access_token.split(".")[1]));
    const roles: string[] = payload?.realm_access?.roles || [];
    response.cookies.set("user_role",
      roles.includes("it-admin") ? "it-admin" : "employee",
      { httpOnly: false, sameSite: "lax", maxAge: expires_in || 900, path: "/" });
  } catch {}

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  ["access_token", "refresh_token", "user_role"].forEach(name =>
    response.cookies.delete(name));
  return response;
}
