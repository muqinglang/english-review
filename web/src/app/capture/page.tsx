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
          <Link href="/review" className="rounded-lg px-3 py-2 text-sm font-bold text-[#4e8a70] hover:bg-white">← Back to review</Link>
        </nav>
        <header className="mt-12">
          <p className="text-sm font-extrabold tracking-[0.16em] text-[#4e8a70]">CAPTURE WHAT YOU LEARNED</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">Add content</h1>
          <p className="mt-4 max-w-2xl leading-7 text-[#596861]">Add the questions and answers you didn&apos;t know—and want to review—from your English training conversations into the review system. If the content is from yesterday&apos;s conversation, set the learning date to yesterday; the system will schedule the first review for today.</p>
        </header>
        {error && <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">Failed to load knowledge spaces. Please refresh and try again.</p>}
        <LearningCaptureForm spaces={spaces} />
      </div>
    </main>
  );
}
