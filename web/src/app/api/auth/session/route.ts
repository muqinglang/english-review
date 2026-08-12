import { NextRequest, NextResponse } from "next/server";
import { clearLegacySessionCookies, writeSessionCookies } from "@/lib/auth-session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return Response.json({ message: "请求来源无效。" }, { status: 403 });
  }
  const { accessToken, refreshToken } = await request.json().catch(() => ({}));
  if (
    typeof accessToken !== "string" || !accessToken || accessToken.length > 10_000 ||
    typeof refreshToken !== "string" || !refreshToken || refreshToken.length > 10_000
  ) return Response.json({ message: "会话无效。" }, { status: 400 });
  const { data } = await createAdminClient().auth.getUser(accessToken);
  if (!data.user) return Response.json({ message: "会话验证失败。" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  clearLegacySessionCookies(request, response);
  writeSessionCookies(response, { access_token: accessToken, refresh_token: refreshToken });
  return response;
}
