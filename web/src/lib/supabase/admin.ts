import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/** Server-only database client. Never import this module from browser code. */
export function createAdminClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
