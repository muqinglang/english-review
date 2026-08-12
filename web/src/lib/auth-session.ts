import type { NextRequest, NextResponse } from "next/server";

export const ACCESS_COOKIE_NAME = "english-review-access";
export const REFRESH_COOKIE_NAME = "english-review-refresh";
export const SESSION_WINDOW_SECONDS = 24 * 60 * 60;

const ACCESS_REFRESH_SKEW_SECONDS = 60;
const ACCESS_COOKIE_MAX_SECONDS = 60 * 60;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV !== "development",
  path: "/",
};

function legacyBrowserAuthCookiePrefix() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function clearLegacyBrowserAuthCookies(request: NextRequest, response: NextResponse) {
  const prefix = legacyBrowserAuthCookiePrefix();
  if (!prefix) return;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cookieName = new RegExp(`^${escaped}(?:\\.\\d+)?$`);
  for (const cookie of request.cookies.getAll()) {
    if (cookieName.test(cookie.name)) {
      response.cookies.set(cookie.name, "", { ...cookieOptions, maxAge: 0 });
    }
  }
}

function jwtExpiration(token: string) {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

export function accessTokenNeedsRefresh(token: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token) return true;
  const expiration = jwtExpiration(token);
  return expiration === null || expiration <= nowSeconds + ACCESS_REFRESH_SKEW_SECONDS;
}

export function accessCookieMaxAge(token: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expiration = jwtExpiration(token);
  if (expiration === null) return ACCESS_COOKIE_MAX_SECONDS;
  return Math.max(1, Math.min(ACCESS_COOKIE_MAX_SECONDS, Math.floor(expiration - nowSeconds)));
}

export function writeSessionCookies(
  response: NextResponse,
  session: { access_token: string; refresh_token: string },
) {
  response.cookies.set(ACCESS_COOKIE_NAME, session.access_token, {
    ...cookieOptions,
    maxAge: accessCookieMaxAge(session.access_token),
  });
  response.cookies.set(REFRESH_COOKIE_NAME, session.refresh_token, {
    ...cookieOptions,
    maxAge: SESSION_WINDOW_SECONDS,
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
}

export function writeSessionCookiesToRequest(
  request: NextRequest,
  session: { access_token: string; refresh_token: string },
) {
  request.cookies.set(ACCESS_COOKIE_NAME, session.access_token);
  request.cookies.set(REFRESH_COOKIE_NAME, session.refresh_token);
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
}

export function clearAllSessionCookies(request: NextRequest, response: NextResponse) {
  clearSessionCookies(response);
  clearLegacyBrowserAuthCookies(request, response);
}

export function clearLegacySessionCookies(request: NextRequest, response: NextResponse) {
  clearLegacyBrowserAuthCookies(request, response);
}
