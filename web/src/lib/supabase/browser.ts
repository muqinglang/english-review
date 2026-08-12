"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase browser configuration is missing.");
  return createBrowserClient(url, key);
}

/**
 * OAuth/PKCE needs a short-lived browser cookie while the provider redirects
 * back to us. Once the server has stored the session in HttpOnly cookies, do
 * not leave Supabase's browser-readable copy of the refresh token behind.
 */
export function clearBrowserSupabaseAuthCookies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return;
  let storageKey: string;
  try {
    const projectRef = new URL(url).hostname.split(".")[0];
    if (!projectRef) return;
    storageKey = `sb-${projectRef}-auth-token`;
  } catch {
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=", 1)[0]?.trim();
    if (!name || (name !== storageKey && !name.startsWith(`${storageKey}.`))) continue;
    const suffix = name.slice(storageKey.length);
    if (suffix && !/^\.\d+$/.test(suffix)) continue;
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
}
