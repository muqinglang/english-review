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

function isHomeRequest(request: NextRequest) {
  return request.nextUrl.pathname === "/";
}

function homePage(request: NextRequest, options?: { clearSession?: boolean }) {
  const response = NextResponse.next({ request: { headers: request.headers } });
  if (options?.clearSession) clearAllSessionCookies(request, response);
  else {
    clearLegacySessionCookies(request, response);
    if (request.cookies.getAll().length) response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return response;
}

function reviewRedirect(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/review", request.url));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function unauthenticated(request: NextRequest) {
  const response = isApiRequest(request)
    ? NextResponse.json({ message: "Please sign in first." }, { status: 401 })
    : NextResponse.redirect(new URL("/login", request.url));
  clearAllSessionCookies(request, response);
  return response;
}

function temporarilyUnavailable(request: NextRequest) {
  if (isApiRequest(request)) {
    return NextResponse.json(
      { message: "Sign-in status can't be verified right now; please try again later." },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
  return new NextResponse("Sign-in status can't be verified right now; please refresh the page later.", {
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
    const response = isHomeRequest(request)
      ? reviewRedirect(request)
      : NextResponse.next({ request: { headers: request.headers } });
    clearLegacySessionCookies(request, response);
    return response;
  }
  if (!refreshToken) {
    return isHomeRequest(request) ? homePage(request, { clearSession: Boolean(accessToken) }) : unauthenticated(request);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return isHomeRequest(request) ? homePage(request) : temporarilyUnavailable(request);
  }

  try {
    const supabase = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      const status = error && "status" in error ? Number(error.status) : 0;
      if ([400, 401, 403].includes(status)) {
        return isHomeRequest(request) ? homePage(request, { clearSession: true }) : unauthenticated(request);
      }
      return isHomeRequest(request) ? homePage(request) : temporarilyUnavailable(request);
    }

    writeSessionCookiesToRequest(request, data.session);
    const response = isHomeRequest(request)
      ? reviewRedirect(request)
      : NextResponse.next({ request: { headers: request.headers } });
    clearLegacySessionCookies(request, response);
    writeSessionCookies(response, data.session);
    return response;
  } catch {
    // A temporary network or service failure must not destroy an otherwise
    // refreshable session or force the learner through a new login.
    return isHomeRequest(request) ? homePage(request) : temporarilyUnavailable(request);
  }
}

export const config = {
  matcher: [
    "/",
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
