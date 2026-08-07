import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogoutButton } from "@/components/logout-button";
import { WorkerTokenPanel, type WorkerDevice } from "@/components/worker-token-panel";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { data } = await createAdminClient().from("worker_devices").select("id,display_name,created_at,last_seen_at,revoked_at").eq("user_id", user.id).order("created_at", { ascending: false });
  const devices: WorkerDevice[] = (data ?? []).map((device) => ({ id: device.id, displayName: device.display_name, createdAt: device.created_at, lastSeenAt: device.last_seen_at, revokedAt: device.revoked_at }));
  return <main className="min-h-screen bg-[#f7f7f2] px-5 py-8 text-[#172223] sm:px-10"><div className="mx-auto max-w-4xl"><nav className="flex items-center justify-between"><Link href="/review" className="font-black">Chat Review</Link><Link href="/review" className="rounded-lg px-3 py-2 text-sm font-bold text-[#4e8a70] hover:bg-white">← 返回复习</Link></nav><header className="mt-12"><p className="text-sm font-extrabold tracking-[0.16em] text-[#4e8a70]">ACCOUNT SETTINGS</p><h1 className="mt-3 text-4xl font-black sm:text-5xl">设置</h1><p className="mt-4 text-[#596861]">管理账号与本机 Worker 连接。</p></header><section className="mt-8 rounded-2xl border border-[#dce4dc] bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-extrabold tracking-[0.12em] text-[#6d7a74]">账号</p><p className="mt-2 font-extrabold">{user.email ?? "已登录用户"}</p><p className="mt-1 text-sm text-[#76837c]">通过 Supabase 安全认证</p></div><LogoutButton /></div></section><div className="mt-6"><WorkerTokenPanel devices={devices} /></div></div></main>;
}
