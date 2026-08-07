import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { accessToken, refreshToken, expiresIn } = await request.json().catch(() => ({}));
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return Response.json({ message: "会话无效。" }, { status: 400 });
  const { data } = await createAdminClient().auth.getUser(accessToken);
  if (!data.user) return Response.json({ message: "会话验证失败。" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set("english-review-access", accessToken, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: typeof expiresIn === "number" ? expiresIn : 3600 });
  response.cookies.set("english-review-refresh", refreshToken, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}
