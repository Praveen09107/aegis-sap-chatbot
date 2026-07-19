"use client";

export async function loginWithCredentials(username: string, password: string):
    Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.success) {
      return { success: false, error: data.error || "Invalid credentials." };
    }
    return { success: true };
  } catch {
    return { success: false, error: "Connection error. Please try again." };
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const resp = await fetch("/api/auth/refresh", { method: "POST" });
    return resp.ok;
  } catch { return false; }
}

export async function logout() {
  await fetch("/api/auth/set-token", { method: "DELETE" });
  window.location.href = "/login";
}

export function isAuthenticated(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes("user_role=");
}

export function getUserRole(): "employee" | "it-admin" | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/user_role=([^;]+)/);
  return match ? (match[1] as "employee" | "it-admin") : null;
}

export interface AuthState {
  isAuthenticated: boolean;
  role: "employee" | "it-admin" | null;
}

export function getAuthState(): AuthState {
  const role = getUserRole();
  if (!role) return { isAuthenticated: false, role: null };
  return { isAuthenticated: true, role };
}

// IMPORTANT: always returns null in client-side code — access_token is an
// HttpOnly cookie, invisible to JavaScript by design. All API calls must go
// through /api/proxy/, which reads the cookie server-side and attaches the
// Authorization header there. Never build an Authorization header from this.
export function getAccessToken(): string | null {
  return null;
}
