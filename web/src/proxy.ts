import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  accessTokenNeedsRefresh,
  clearAllSessionCookies,
  clearLegacySessionCookies,
  writeSessionCookies,
  writeSessionCookiesToRequest,
} from "@/lib/auth-session";

function isApiRequest(request: NextRequest) {
  return request.nextUrl.pathname.startsWith("/api/");
}

function unauthenticated(request: NextRequest) {
  const response = isApiRequest(request)
    ? NextResponse.json({ message: "请先登录。" }, { status: 401 })
    : NextResponse.redirect(new URL("/login", request.url));
  clearAllSessionCookies(request, response);
  return response;
}

function temporarilyUnavailable(request: NextRequest) {
  if (isApiRequest(request)) {
    return NextResponse.json(
      { message: "登录状态暂时无法验证，请稍后重试。" },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
  return new NextResponse("登录状态暂时无法验证，请稍后刷新页面。", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

  if (!accessTokenNeedsRefresh(accessToken)) {
    const response = NextResponse.next({ request: { headers: request.headers } });
    clearLegacySessionCookies(request, response);
    return response;
  }
  if (!refreshToken) return unauthenticated(request);

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return temporarilyUnavailable(request);

  try {
    const supabase = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      const status = error && "status" in error ? Number(error.status) : 0;
      if ([400, 401, 403].includes(status)) return unauthenticated(request);
      return temporarilyUnavailable(request);
    }

    writeSessionCookiesToRequest(request, data.session);
    const response = NextResponse.next({ request: { headers: request.headers } });
    clearLegacySessionCookies(request, response);
    writeSessionCookies(response, data.session);
    return response;
  } catch {
    // A temporary network or service failure must not destroy an otherwise
    // refreshable session or force the learner through a new login.
    return temporarilyUnavailable(request);
  }
}

export const config = {
  matcher: [
    "/review/:path*",
    "/capture/:path*",
    "/settings/:path*",
    "/api/review/:path*",
    "/api/learning-items/:path*",
    "/api/tts/:path*",
    "/api/integrations/:path*",
    "/api/worker/device/:path*",
  ],
};
