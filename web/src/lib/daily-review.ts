import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { shanghaiDate, toScheduleItem, type LearningItemRecord } from "@/lib/srs";

// How many due items go into an auto-generated daily review, and how many of
// those may be brand-new (never seen) — mirrors the worker context policy.
const MAX_ITEMS = 12;
const MAX_UNSEEN = 2;
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const TYPE_ALLOW = new Set(["fact", "concept", "decision", "quote", "vocabulary", "expression", "error", "pronunciation"]);

const hasCjk = (value: string) => /[一-鿿]/.test(value);
const hasLatin = (value: string) => /[A-Za-z]/.test(value);

// A clean English sentence for a listening card: a rich example's first English
// line, else a plain-English example, else an English answer. Null if none.
function englishSentence(example: string | null, answer: string): string | null {
  if (example) {
    const trimmed = example.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as { examples?: { english?: unknown }[] };
        for (const entry of parsed.examples ?? []) {
          const english = typeof entry.english === "string" ? entry.english.trim() : "";
          if (english && hasLatin(english)) return english;
        }
      } catch {
        // fall through to answer
      }
    } else if (hasLatin(trimmed) && !hasCjk(trimmed)) {
      return trimmed;
    }
  }
  const trimmedAnswer = answer.trim();
  if (trimmedAnswer && hasLatin(trimmedAnswer) && !hasCjk(trimmedAnswer)) return trimmedAnswer;
  return null;
}

const resolveType = (type: string) => (TYPE_ALLOW.has(type) ? type : "expression");

// Ensure each of the user's knowledge spaces has today's daily review, building
// it from the items that are actually DUE (spaced-repetition), so the review page
// shows fresh content without any manual worker push. Idempotent per day: if a
// review for today already exists it is left untouched (recomputing after grading
// would drop now-not-due items and hit the "published items must be retained"
// guard). Never throws — a failure just leaves the page to render what exists.
export async function ensureTodayReview(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const today = shanghaiDate();

    const { data: spaces, error: spacesError } = await admin
      .from("knowledge_spaces")
      .select("id")
      .eq("user_id", userId);
    if (spacesError || !spaces?.length) return;

    for (const space of spaces) {
      const { data: existing } = await admin
        .from("reviews")
        .select("id")
        .eq("user_id", userId)
        .eq("knowledge_space_id", space.id)
        .eq("review_date", today)
        .maybeSingle();
      if (existing) continue; // today's review already materialized

      const { data: rows, error: itemsError } = await admin
        .from("learning_items")
        .select("id,normalized_key,type,cue,answer,example,priority,occurrences,attempts,correct,next_due,learned_on,last_shown,status,review_stage,correct_streak,last_result,last_answered_at")
        .eq("user_id", userId)
        .eq("knowledge_space_id", space.id)
        .lte("next_due", today)
        .order("next_due", { ascending: true })
        .limit(1000);
      if (itemsError || !rows?.length) continue;

      const selectable = (rows as LearningItemRecord[])
        .map((item) => toScheduleItem(item, today))
        .filter((item) => item.selectable)
        .sort((left, right) =>
          Number(right.pendingAnswer) - Number(left.pendingAnswer)
          || Number(left.isNew) - Number(right.isNew)
          || left.nextDue.localeCompare(right.nextDue)
          || PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
          || right.occurrences - left.occurrences
          || left.normalizedKey.localeCompare(right.normalizedKey));
      if (!selectable.length) continue;

      const picked: typeof selectable = [];
      let unseen = 0;
      for (const item of selectable) {
        if (picked.length >= MAX_ITEMS) break;
        if (item.isNew) {
          if (unseen >= MAX_UNSEEN) continue;
          unseen += 1;
        }
        picked.push(item);
      }
      if (!picked.length) continue;

      const audioCards = picked
        .map((item) => {
          const normal = englishSentence(item.example, item.answer);
          return normal ? { id: item.id, prompt: "Listen, then write what you hear.", normal: normal.slice(0, 10_000) } : null;
        })
        .filter((card): card is { id: string; prompt: string; normal: string } => card !== null);

      const markdown = [
        `# Daily Review | ${today}`,
        "",
        `Listen, recall, and check. ${picked.length} items due today.`,
        "",
        ...picked.map((item, index) => `${index + 1}. ${item.cue} => ${item.answer}`),
      ].join("\n");

      const { error: saveError } = await admin.rpc("save_daily_review_with_items", {
        p_user_id: userId,
        p_knowledge_space_id: space.id,
        p_review_date: today,
        p_content_json: {
          format: "markdown",
          title: `Daily Review | ${today}`,
          markdown,
          durationMinutes: "8-12",
          level: "B1",
        },
        p_audio_script_json: { cards: audioCards },
        p_learning_items_json: picked.map((item) => ({
          normalized_key: item.normalizedKey,
          type: resolveType(item.type),
          cue: item.cue,
          answer: item.answer,
          example: item.example,
          priority: item.priority,
          occurrences: item.occurrences,
          due_date: item.nextDue,
          learned_on: item.learnedOn,
        })),
      });
      if (saveError) {
        console.error("Auto daily-review generation failed", { spaceId: space.id, code: saveError.code });
      }
    }
  } catch (error) {
    // Auto-generation is best-effort; never block the review page.
    console.error("ensureTodayReview failed", error);
  }
}
