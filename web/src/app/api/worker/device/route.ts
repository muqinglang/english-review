import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { newWorkerToken, workerTokenHash } from "@/lib/worker";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "请先登录。" }, { status: 401 });
  const { displayName = "My local Worker" } = await request.json().catch(() => ({}));
  if (typeof displayName !== "string" || !displayName.trim()) return Response.json({ message: "设备名称无效。" }, { status: 400 });
  const admin = createAdminClient();
  const { error: profileError } = await admin.from("profiles").upsert({ id: user.id });
  if (profileError) {
    console.error("Worker profile initialization failed", profileError);
    return Response.json({ message: "无法初始化用户资料。请稍后重试。" }, { status: 500 });
  }
  const token = newWorkerToken();
  const { error } = await admin.from("worker_devices").insert({ user_id: user.id, display_name: displayName.trim().slice(0, 80), token_hash: workerTokenHash(token) });
  if (error) {
    console.error("Worker device creation failed", error);
    return Response.json({ message: "无法创建 Worker 令牌。请稍后重试。" }, { status: 500 });
  }
  return Response.json({ token, warning: "此令牌仅显示一次；请保存在本机 Worker 配置中。" }, { status: 201 });
}
