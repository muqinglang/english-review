"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    await createBrowserSupabaseClient().auth.signOut({ scope: "local" }).catch(() => undefined);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return <Button variant="danger" size="sm" onClick={logout} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</Button>;
}
