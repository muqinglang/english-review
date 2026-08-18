import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({}));
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return Response.json({ message: "Please enter a valid email address." }, { status: 400 });
  }
  const origin = new URL(request.url).origin;
  const { error } = await createAdminClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) {
    console.error("Magic link request failed", error.message);
    return Response.json({ message: "Unable to send the sign-in link; please check the auth configuration and try again." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
