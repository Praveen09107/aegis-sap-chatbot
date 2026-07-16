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

export function getAccessToken(): string | null {
  return null; // HttpOnly — not readable from JS. Use /api/proxy/ for API calls.
}
