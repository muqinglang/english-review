import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function currentUser() {
  const token = (await cookies()).get("english-review-access")?.value;
  if (!token) return null;
  const { data } = await createAdminClient().auth.getUser(token);
  return data.user ?? null;
}
