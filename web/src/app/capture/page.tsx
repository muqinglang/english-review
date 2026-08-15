import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearningCaptureForm, type CaptureKnowledgeSpace } from "@/components/learning-capture-form";

export default async function CapturePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { data, error } = await createAdminClient()
    .from("knowledge_spaces")
    .select("id,display_name")
    .eq("user_id", user.id)
    .order("created_at");

  if (error) console.error("Learning capture knowledge-space query failed", error);
  const spaces: CaptureKnowledgeSpace[] = (data ?? []).map((space) => ({
    id: space.id,
    name: space.display_name,
  }));

  return (
    <main className="min-h-screen bg-[#f7f7f2] px-5 py-8 text-[#172223] sm:px-10">
      <div className="mx-auto max-w-4xl">
        <nav className="flex items-center justify-between gap-4">
          <Link href="/review" className="font-black">Chat Review</Link>
          <Link href="/review" className="rounded-lg px-3 py-2 text-sm font-bold text-[#4e8a70] hover:bg-white">← 返回复习</Link>
        </nav>
        <header className="mt-12">
          <p className="text-sm font-extrabold tracking-[0.16em] text-[#4e8a70]">CAPTURE WHAT YOU LEARNED</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">添加学习内容</h1>
          <p className="mt-4 max-w-2xl leading-7 text-[#596861]">把 English Tranning 对话中不会、想复习的问题和答案放进复习系统。若内容来自昨天的对话，请把学习日期选为昨天；系统会在今天安排首次复习。</p>
        </header>
        {error && <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">知识库加载失败，请刷新后重试。</p>}
        <LearningCaptureForm spaces={spaces} />
      </div>
    </main>
  );
}
