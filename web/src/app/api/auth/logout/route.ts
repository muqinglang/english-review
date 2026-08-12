import { NextRequest, NextResponse } from "next/server";
import { clearAllSessionCookies } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  clearAllSessionCookies(request, response);
  return response;
}
