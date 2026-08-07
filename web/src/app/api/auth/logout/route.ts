import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("english-review-access", "", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0 });
  response.cookies.set("english-review-refresh", "", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0 });
  return response;
}
