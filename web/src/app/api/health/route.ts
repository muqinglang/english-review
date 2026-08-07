import { hasSupabaseConfiguration } from "@/lib/env";

export function GET() {
  return Response.json({
    service: "english-review",
    status: "ok",
    phase: "worker-push-v1",
    dataConnection: hasSupabaseConfiguration() ? "configured" : "pending",
  });
}
