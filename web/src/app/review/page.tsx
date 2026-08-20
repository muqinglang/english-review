import Link from "next/link";
import { GearSix, Plus, SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeElevenLabsMetadata, type ElevenLabsVoice } from "@/lib/elevenlabs";
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

type YesterdayConversationRow = {
  id: string;
  created_at: string;
  normalized_key: string;
  cue: string;
  answer: string;
  example: string | null;
  practice_sessions: { id: string; knowledge_space_id: string; practice_date: string } | { id: string; knowledge_space_id: string; practice_date: string }[] | null;
  practice_attempts: { id: string }[];
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

  const accountLabel = user.email?.split("@", 1)[0]?.trim() || "User";

  const admin = createAdminClient();
  // One round-trip per data source, all in parallel — including both optional
  // voice/story integrations in a single credentials query so navigation doesn't
  // pay for extra sequential Supabase calls.
  const [{ data: spaces, error: spacesError }, { data: reviews, error: reviewsError }, { data: conversationItems, error: conversationItemsError }, { data: integrationRows }] = await Promise.all([
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
    admin
      .from("practice_items")
      .select("id,created_at,normalized_key,cue,answer,example,practice_sessions!inner(id,knowledge_space_id,practice_date),practice_attempts(id)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("integration_credentials")
      .select("provider,metadata")
      .eq("user_id", user.id)
      .in("provider", ["elevenlabs", "deepseek"]),
  ]);
  let elevenLabsVoices: ElevenLabsVoice[] = [];
  for (const row of integrationRows ?? []) {
    try {
      if (row.provider === "elevenlabs") elevenLabsVoices = normalizeElevenLabsMetadata(row.metadata).voices;
    } catch {
      // A malformed integration row must never break the review page.
    }
  }
  let structuredLoadError = Boolean(spacesError || reviewsError || conversationItemsError);
  if (spacesError) console.error("Review knowledge-space query failed", spacesError);
  if (reviewsError) console.error("Review library query failed", reviewsError);
  if (conversationItemsError) console.error("Latest conversation-item query failed", conversationItemsError);
  const sessionFor = (item: YesterdayConversationRow) => Array.isArray(item.practice_sessions)
    ? item.practice_sessions[0] ?? null
    : item.practice_sessions;
  const rawConversationRows = (conversationItems ?? []) as YesterdayConversationRow[];
  const conversationDiagnostics = rawConversationRows.map((item) => {
    let scenarioCount = 0;
    try {
      const parsed = JSON.parse(item.example ?? "") as { examples?: unknown };
      scenarioCount = Array.isArray(parsed.examples) ? parsed.examples.length : 0;
    } catch {
      // Legacy plain-text examples intentionally report zero scenarios.
    }
    const session = sessionFor(item);
    return {
      itemId: item.id,
      sessionId: session?.id ?? null,
      practiceDate: session?.practice_date ?? null,
      key: item.normalized_key,
      createdAt: item.created_at,
      attempts: item.practice_attempts?.length ?? 0,
      exampleFormat: item.example?.trim().startsWith("{") ? "json" : "plain",
      scenarioCount,
    };
  });
  // Aggregate counts only — never log per-item keys/content to server logs.
  console.info("Conversation review diagnostics", {
    total: rawConversationRows.length,
    rich: conversationDiagnostics.filter((item) => item.scenarioCount >= 3).length,
    ungraded: conversationDiagnostics.filter((item) => item.attempts === 0).length,
  });
  // Group every synced conversation batch by its practice session so the review
  // page can offer a per-date picker (not only the newest batch). We do NOT
  // require the rich {meaning, 3 scenarios} shape here: if ChatGPT only produced
  // plain-text examples, the card still renders (plain fallback) instead of the
  // whole batch silently disappearing. Already-self-graded items stay visible but
  // are marked `graded` so the client shows them as done (they have moved on to
  // the SRS "Review History" queue and cannot be re-graded here).
  type ConversationSessionGroup = { id: string; date: string; createdAt: string; items: YesterdayConversationRow[] };
  const conversationSessionsBySpace = new Map<string, Map<string, ConversationSessionGroup>>();
  for (const item of rawConversationRows) {
    const session = sessionFor(item);
    if (!session) continue;
    const bySpace = conversationSessionsBySpace.get(session.knowledge_space_id) ?? new Map<string, ConversationSessionGroup>();
    const existing = bySpace.get(session.id);
    if (existing) {
      existing.items.push(item);
      if (item.created_at > existing.createdAt) existing.createdAt = item.created_at;
    } else {
      bySpace.set(session.id, { id: session.id, date: session.practice_date, createdAt: item.created_at, items: [item] });
    }
    conversationSessionsBySpace.set(session.knowledge_space_id, bySpace);
  }

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
    conversationSessions: [...(conversationSessionsBySpace.get(space.id)?.values() ?? [])]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.date.localeCompare(left.date))
      .map((session) => ({
        id: session.id,
        date: session.date,
        items: session.items.map((item) => ({
          id: item.id,
          normalizedKey: item.normalized_key,
          cue: item.cue,
          answer: item.answer,
          example: item.example,
          graded: (item.practice_attempts?.length ?? 0) > 0,
        })),
      })),
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
          title: typeof content.title === "string" ? content.title : "Daily review",
          markdown: typeof content.markdown === "string" ? content.markdown : "",
          duration: typeof content.durationMinutes === "string" ? content.durationMinutes : "8-12",
          level: typeof content.level === "string" ? content.level : "B1",
          audioCards: Array.isArray(audio.cards) ? audio.cards : [],
          cards,
        };
      }),
  }));

  return (
    <main className="min-h-[100dvh] bg-[#f4f6f3] px-4 py-4 text-[#172223] sm:px-8 sm:py-6">
      <div className="mx-auto max-w-7xl">
        <nav className="flex items-center justify-between border-b border-[#d9dfd8] pb-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-black tracking-tight"><span className="grid size-8 place-items-center rounded-xl bg-[#172223] text-white"><SquaresFour size={17} weight="fill" /></span>Chat Review</Link>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-28 truncate text-xs font-bold text-[#4e8a70] sm:inline" title={user.email ?? undefined}>{accountLabel}</span>
            <Link href="/capture" aria-label="Add content" title="Add content" className="grid size-9 place-items-center rounded-xl bg-[#172223] text-white transition hover:bg-[#2e403c] active:translate-y-px"><Plus size={18} weight="bold" /></Link>
            <Link href="/settings" aria-label="Settings" title="Settings" className="grid size-9 place-items-center rounded-xl border border-[#cdd6cf] bg-white text-[#41514b] transition hover:border-[#8eaa9a] active:translate-y-px"><GearSix size={18} /></Link>
          </div>
        </nav>
        <header className="grid gap-3 py-10 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:py-14">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-[#4e8a70]">ENGLISH REVIEW</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Turn what you can&apos;t into what you can.</h1>
          </div>
          <p className="max-w-sm text-sm leading-6 text-[#596861]">Recall first, then check. Your self-rating decides when it shows up next.</p>
        </header>
        {libraries.length ? (
          <ReviewLibrary libraries={libraries} loadWarning={structuredLoadError} elevenLabsVoices={elevenLabsVoices} />
        ) : (
          <section className="mt-8 rounded-2xl border border-[#dce4dc] bg-white p-10 text-center">
            <h2 className="text-xl font-black">No review categories yet</h2>
            <p className="mt-3 text-[#718078]">Connect your local Worker and push the first daily review — it&apos;ll show up here.</p>
          </section>
        )}
      </div>
    </main>
  );
}
