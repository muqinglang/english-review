import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ReviewPage() {
  const token = (await cookies()).get("english-review-access")?.value;
  const user = await currentUser();
  if (!token || !user) redirect("/login");
  const admin = createAdminClient();
  const [{ data: spaces }, { data: dueItems }] = await Promise.all([admin.from("knowledge_spaces").select("id,display_name").eq("user_id", user.id).order("created_at"), admin.from("learning_items").select("id,cue,answer,next_due,knowledge_spaces(display_name)").eq("user_id", user.id).lte("next_due", new Date().toISOString().slice(0, 10)).order("next_due").limit(8)]);
  return <main className="min-h-screen bg-[#f7f7f2] px-5 py-10 text-[#172223] sm:px-10"><div className="mx-auto max-w-3xl"><nav className="flex justify-between"><Link href="/" className="font-black">Chat Review</Link><span className="text-sm font-bold text-[#4e8a70]">已登录</span></nav><section className="mt-16 rounded-[2rem] bg-white p-8 shadow-xl shadow-[#172223]/10"><p className="text-sm font-bold tracking-[0.14em] text-[#4e8a70]">YOUR KNOWLEDGE SPACE</p><h1 className="mt-3 text-4xl font-black">今日回顾</h1><p className="mt-5 leading-7 text-[#596861]">{spaces?.length ? `已有 ${spaces.length} 个知识库。` : "还没有知识库：创建 Worker 令牌并完成第一次推送后，内容会显示在这里。"}</p>{dueItems?.length ? <div className="mt-8 space-y-3">{dueItems.map((item) => <article key={item.id} className="rounded-xl border border-[#dce2dc] p-4"><p className="text-xs font-bold text-[#4e8a70]">{(item.knowledge_spaces as { display_name?: string } | null)?.display_name ?? "General"}</p><p className="mt-1 font-bold">{item.cue}</p><details className="mt-2 text-sm text-[#596861]"><summary>显示答案</summary><p className="mt-2">{item.answer}</p></details></article>)}</div> : null}</section></div></main>;
}
