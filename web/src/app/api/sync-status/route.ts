import { hasSupabaseConfiguration } from "@/lib/env";

export function GET() {
  if (!hasSupabaseConfiguration()) {
    return Response.json(
      { status: "pending_configuration", message: "Supabase is not configured yet." },
      { status: 503 },
    );
  }

  return Response.json({ status: "ready_for_auth" });
}
