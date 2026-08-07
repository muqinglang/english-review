import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  const { data, error } = await createAdminClient().auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(new URL("/login?error=verification_failed", url.origin));
  const response = NextResponse.redirect(new URL("/review", url.origin));
  response.cookies.set("english-review-access", data.session.access_token, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: data.session.expires_in });
  response.cookies.set("english-review-refresh", data.session.refresh_token, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}
