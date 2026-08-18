import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { newWorkerToken, workerTokenHash } from "@/lib/worker";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Please sign in first." }, { status: 401 });
  const { displayName = "My local Worker" } = await request.json().catch(() => ({}));
  if (typeof displayName !== "string" || !displayName.trim()) return Response.json({ message: "Invalid device name." }, { status: 400 });
  const admin = createAdminClient();
  const { error: profileError } = await admin.from("profiles").upsert({ id: user.id });
  if (profileError) {
    console.error("Worker profile initialization failed", profileError);
    return Response.json({ message: "Unable to initialize user profile. Please try again later." }, { status: 500 });
  }
  const token = newWorkerToken();
  const { error } = await admin.from("worker_devices").insert({ user_id: user.id, display_name: displayName.trim().slice(0, 80), token_hash: workerTokenHash(token) });
  if (error) {
    console.error("Worker device creation failed", error);
    return Response.json({ message: "Unable to create Worker token. Please try again later." }, { status: 500 });
  }
  return Response.json({ token, warning: "This token is shown only once; save it in your local Worker configuration." }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Please sign in first." }, { status: 401 });
  const { deviceId } = await request.json().catch(() => ({}));
  if (typeof deviceId !== "string" || !deviceId) return Response.json({ message: "Invalid device ID." }, { status: 400 });
  const { data, error } = await createAdminClient().from("worker_devices").update({ revoked_at: new Date().toISOString() }).eq("id", deviceId).eq("user_id", user.id).is("revoked_at", null).select("id").maybeSingle();
  if (error) return Response.json({ message: "Unable to revoke Worker token." }, { status: 500 });
  if (!data) return Response.json({ message: "Device not found or already revoked." }, { status: 404 });
  return Response.json({ ok: true });
}
