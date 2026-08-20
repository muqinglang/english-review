import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearningCaptureForm, type CaptureKnowledgeSpace } from "@/components/learning-capture-form";
import { AppShell, BackToReviewLink } from "@/components/ui/app-shell";

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
    <AppShell width="narrow" right={<BackToReviewLink />}>
      <header className="mt-10 sm:mt-12">
        <p className="text-sm font-extrabold tracking-[0.16em] text-primary">CAPTURE WHAT YOU LEARNED</p>
        <h1 className="mt-3 text-4xl font-black sm:text-5xl">Add content</h1>
        <p className="mt-4 max-w-2xl leading-7 text-muted">Add the questions and answers you didn&apos;t know—and want to review—from your English training conversations into the review system. If the content is from yesterday&apos;s conversation, set the learning date to yesterday; the system will schedule the first review for today.</p>
      </header>
      {error && <p className="mt-8 rounded-card bg-red-50 p-4 text-sm text-red-700" role="alert">Failed to load knowledge spaces. Please refresh and try again.</p>}
      <LearningCaptureForm spaces={spaces} />
    </AppShell>
  );
}
