import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewLibrary, type ReviewLibraryData } from "@/components/review-library";

type JsonObject = Record<string, unknown>;
type AttemptResult = "incorrect" | "partial" | "correct";
const QUERY_CHUNK_SIZE = 100;

function chunks<T>(values: T[]) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += QUERY_CHUNK_SIZE) {
    result.push(values.slice(index, index + QUERY_CHUNK_SIZE));
  }
  return result;
}

type ReviewItemRow = {
  id: string;
  review_id: string;
  position: number;
  learning_item_id: string;
  shown_at: string | null;
};

type LearningItemRow = {
  id: string;
  normalized_key: string;
  cue: string;
  answer: string;
  example: string | null;
  review_stage: number | null;
  next_due: string;
  last_result: AttemptResult | null;
  last_answered_at: string | null;
  status: string;
};

type ReviewAttemptRow = {
  review_item_id: string;
  result: AttemptResult | null;
  answered_at: string;
};

export default async function ReviewPage() {
  const token = (await cookies()).get("english-review-access")?.value;
  const user = await currentUser();
  if (!token || !user) redirect("/login");

  const admin = createAdminClient();
  const [{ data: spaces, error: spacesError }, { data: reviews, error: reviewsError }] = await Promise.all([
    admin
      .from("knowledge_spaces")
      .select("id,display_name")
      .eq("user_id", user.id)
      .order("created_at"),
    admin
      .from("reviews")
      .select("id,review_date,knowledge_space_id,content_json,audio_script_json")
      .eq("user_id", user.id)
      .eq("status", "ready")
      .order("review_date", { ascending: false })
      .limit(60),
  ]);
  let structuredLoadError = Boolean(spacesError || reviewsError);
  if (spacesError) console.error("Review knowledge-space query failed", spacesError);
  if (reviewsError) console.error("Review library query failed", reviewsError);

  const reviewIds = (reviews ?? []).map((review) => review.id);
  let reviewItemRows: ReviewItemRow[] = [];
  const learningItemRows: LearningItemRow[] = [];
  const reviewAttemptRows: ReviewAttemptRow[] = [];

  if (reviewIds.length) {
    const { data: reviewItems, error: reviewItemsError } = await admin
      .from("review_items")
      .select("id,review_id,position,learning_item_id,shown_at")
      .eq("user_id", user.id)
      .in("review_id", reviewIds)
      .order("position", { ascending: true });

    if (reviewItemsError) {
      structuredLoadError = true;
      console.error("Review item query failed", reviewItemsError);
    } else {
      reviewItemRows = (reviewItems ?? []) as ReviewItemRow[];
    }
    const learningItemIds = [...new Set(reviewItemRows.map((item) => item.learning_item_id))];
    const reviewItemIds = reviewItemRows.map((item) => item.id);

    if (learningItemIds.length) {
      const learningItemBatches = await Promise.all(chunks(learningItemIds).map((ids) => admin
          .from("learning_items")
          .select("id,normalized_key,cue,answer,example,review_stage,next_due,last_result,last_answered_at,status")
          .eq("user_id", user.id)
          .in("id", ids)));
      for (const batch of learningItemBatches) {
        if (batch.error) {
          structuredLoadError = true;
          console.error("Learning item query failed", batch.error);
        } else {
          learningItemRows.push(...((batch.data ?? []) as LearningItemRow[]));
        }
      }
    }
    if (reviewItemIds.length) {
      const reviewAttemptBatches = await Promise.all(chunks(reviewItemIds).map((ids) => admin
          .from("review_attempts")
          .select("review_item_id,result,answered_at")
          .eq("user_id", user.id)
          .eq("status", "graded")
          .in("review_item_id", ids)
          .order("answered_at", { ascending: false })));
      for (const batch of reviewAttemptBatches) {
        if (batch.error) {
          structuredLoadError = true;
          console.error("Review attempt query failed", batch.error);
        } else {
          reviewAttemptRows.push(...((batch.data ?? []) as ReviewAttemptRow[]));
        }
      }
    }
  }

  const learningItemsById = new Map(learningItemRows.map((item) => [item.id, item]));
  const gradedResultsByReviewItemId = new Map<string, AttemptResult>();
  for (const attempt of reviewAttemptRows) {
    if (attempt.result && !gradedResultsByReviewItemId.has(attempt.review_item_id)) {
      gradedResultsByReviewItemId.set(attempt.review_item_id, attempt.result);
    }
  }
  const reviewItemsByReviewId = new Map<string, ReviewItemRow[]>();
  for (const item of reviewItemRows) {
    const group = reviewItemsByReviewId.get(item.review_id) ?? [];
    group.push(item);
    reviewItemsByReviewId.set(item.review_id, group);
  }

  const libraries: ReviewLibraryData[] = (spaces ?? []).map((space) => ({
    id: space.id,
    name: space.display_name,
    reviews: (reviews ?? [])
      .filter((review) => review.knowledge_space_id === space.id)
      .map((review) => {
        const content = (review.content_json ?? {}) as JsonObject;
        const audio = (review.audio_script_json ?? {}) as JsonObject;
        const cards = (reviewItemsByReviewId.get(review.id) ?? [])
          .sort((left, right) => left.position - right.position)
          .flatMap((reviewItem) => {
            const learningItem = learningItemsById.get(reviewItem.learning_item_id);
            if (!learningItem) return [];
            const gradedResult = gradedResultsByReviewItemId.get(reviewItem.id) ?? null;
            const stale = !gradedResult && Boolean(
              learningItem.last_answered_at
              && (!reviewItem.shown_at
                || new Date(learningItem.last_answered_at).getTime() >= new Date(reviewItem.shown_at).getTime()),
            );
            return [{
              reviewItemId: reviewItem.id,
              learningItemId: learningItem.id,
              normalizedKey: learningItem.normalized_key,
              position: reviewItem.position,
              cue: learningItem.cue,
              answer: learningItem.answer,
              example: learningItem.example,
              stage: learningItem.review_stage ?? 0,
              nextDue: learningItem.next_due,
              lastResult: learningItem.last_result,
              gradedResult,
              stale,
              status: learningItem.status,
              shownAt: reviewItem.shown_at,
            }];
          });

        return {
          id: review.id,
          date: review.review_date,
          title: typeof content.title === "string" ? content.title : "每日复习",
          markdown: typeof content.markdown === "string" ? content.markdown : "",
          duration: typeof content.durationMinutes === "string" ? content.durationMinutes : "8–12",
          level: typeof content.level === "string" ? content.level : "B1",
          audioCards: Array.isArray(audio.cards) ? audio.cards : [],
          cards,
        };
      }),
  }));

  return (
    <main className="min-h-screen bg-[#f7f7f2] px-5 py-8 text-[#172223] sm:px-10">
      <div className="mx-auto max-w-6xl">
        <nav className="flex items-center justify-between">
          <Link href="/" className="font-black">Chat Review</Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-bold text-[#4e8a70] sm:inline">已登录</span>
            <Link href="/capture" className="rounded-lg bg-[#172223] px-3 py-2 text-sm font-bold text-white hover:bg-[#2a3838]">添加内容</Link>
            <Link href="/settings" className="rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm font-bold text-[#41514b] hover:border-[#9eb9a8]">设置</Link>
          </div>
        </nav>
        <header className="mt-12">
          <p className="text-sm font-extrabold tracking-[0.16em] text-[#4e8a70]">YOUR REVIEW LIBRARY</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">每天复习一点，记得更久。</h1>
          <p className="mt-4 max-w-2xl leading-7 text-[#596861]">先主动回忆题目，再查看答案并自评。系统会按你的掌握情况安排下一次复习。</p>
        </header>
        {libraries.length ? (
          <ReviewLibrary libraries={libraries} loadWarning={structuredLoadError} />
        ) : (
          <section className="mt-8 rounded-2xl border border-[#dce4dc] bg-white p-10 text-center">
            <h2 className="text-xl font-black">还没有复习分类</h2>
            <p className="mt-3 text-[#718078]">连接本机 Worker 并推送第一份每日复习后，内容会显示在这里。</p>
          </section>
        )}
      </div>
    </main>
  );
}
