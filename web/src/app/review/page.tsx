import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewLibrary, type ReviewLibraryData } from "@/components/review-library";

type JsonObject = Record<string, unknown>;

export default async function ReviewPage() {
  const token = (await cookies()).get("english-review-access")?.value;
  const user = await currentUser();
  if (!token || !user) redirect("/login");
  const admin = createAdminClient();
  const [{ data: spaces }, { data: reviews }] = await Promise.all([
    admin.from("knowledge_spaces").select("id,display_name").eq("user_id", user.id).order("created_at"),
    admin.from("reviews").select("id,review_date,knowledge_space_id,content_json,audio_script_json").eq("user_id", user.id).eq("status", "ready").order("review_date", { ascending: false }).limit(60),
  ]);
  const libraries: ReviewLibraryData[] = (spaces ?? []).map((space) => ({
    id: space.id,
    name: space.display_name,
    reviews: (reviews ?? []).filter((review) => review.knowledge_space_id === space.id).map((review) => {
      const content = (review.content_json ?? {}) as JsonObject;
      const audio = (review.audio_script_json ?? {}) as JsonObject;
      return {
        id: review.id,
        date: review.review_date,
        title: typeof content.title === "string" ? content.title : "每日复习",
        markdown: typeof content.markdown === "string" ? content.markdown : "",
        duration: typeof content.durationMinutes === "string" ? content.durationMinutes : "8–12",
        level: typeof content.level === "string" ? content.level : "B1",
        audioCards: Array.isArray(audio.cards) ? audio.cards : [],
      };
    }),
  }));
  return <main className="min-h-screen bg-[#f7f7f2] px-5 py-8 text-[#172223] sm:px-10">
    <div className="mx-auto max-w-6xl">
      <nav className="flex items-center justify-between"><Link href="/" className="font-black">Chat Review</Link><div className="flex items-center gap-2"><span className="hidden text-sm font-bold text-[#4e8a70] sm:inline">已登录</span><Link href="/settings" className="rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm font-bold text-[#41514b] hover:border-[#9eb9a8]">设置</Link></div></nav>
      <header className="mt-12"><p className="text-sm font-extrabold tracking-[0.16em] text-[#4e8a70]">YOUR REVIEW LIBRARY</p><h1 className="mt-3 text-4xl font-black sm:text-5xl">每天复习一点，记得更久。</h1><p className="mt-4 max-w-2xl leading-7 text-[#596861]">按主题保存每天的完整复习：先主动回忆文字题，再用英语语音做听力和跟读。</p></header>
      {libraries.length ? <ReviewLibrary libraries={libraries} /> : <section className="mt-8 rounded-2xl border border-[#dce4dc] bg-white p-10 text-center"><h2 className="text-xl font-black">还没有复习分类</h2><p className="mt-3 text-[#718078]">连接本机 Worker 并推送第一份每日复习后，内容会显示在这里。</p></section>}
    </div>
  </main>;
}
