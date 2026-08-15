import { cookies } from "next/headers";
import { resolveAccountId } from "@/lib/account-aliases";
import { createAdminClient } from "@/lib/supabase/admin";

export async function currentUser() {
  const token = (await cookies()).get("english-review-access")?.value;
  if (!token) return null;
  const { data } = await createAdminClient().auth.getUser(token);
  const user = data.user;
  if (!user) return null;
  // A secondary login is remapped to the canonical account so both accounts
  // read and write one shared dataset. Email is left untouched for display.
  const canonicalId = resolveAccountId(user.id);
  return canonicalId === user.id ? user : { ...user, id: canonicalId };
}
