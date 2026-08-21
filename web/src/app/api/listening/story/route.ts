import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateListeningStory, getDeepSeekCredential } from "@/lib/deepseek";

export const runtime = "nodejs";

// Keep in sync with /api/tts/speak MAX_TEXT_LENGTH so the generated story can
// always be voiced in a single clip by the learner's TTS provider.
const MAX_STORY_LENGTH = 900;

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Please sign in first." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (!isUuid(input.reviewId)) {
    return Response.json({ message: "Invalid review ID." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: review, error: reviewError } = await admin
    .from("reviews")
    .select("id")
    .eq("id", input.reviewId)
    .eq("user_id", user.id)
    .eq("status", "ready")
    .maybeSingle();
  if (reviewError) {
    return Response.json({ message: "Unable to load this review." }, { status: 500 });
  }
  if (!review) {
    return Response.json({ message: "Review not found." }, { status: 404 });
  }

  const { data: reviewItems, error: itemsError } = await admin
    .from("review_items")
    .select("learning_item_id,position")
    .eq("user_id", user.id)
    .eq("review_id", input.reviewId)
    .order("position", { ascending: true });
  if (itemsError) {
    return Response.json({ message: "Unable to load this review's words." }, { status: 500 });
  }

  const learningItemIds = [...new Set((reviewItems ?? []).map((item) => item.learning_item_id))];
  if (!learningItemIds.length) {
    return Response.json({ message: "This review has no words to build a story from yet." }, { status: 422 });
  }

  const { data: learningItems, error: learningError } = await admin
    .from("learning_items")
    .select("normalized_key,answer")
    .eq("user_id", user.id)
    .in("id", learningItemIds);
  if (learningError) {
    return Response.json({ message: "Unable to load this review's words." }, { status: 500 });
  }

  // Pool of target expressions (the English key phrase) plus a short gloss.
  const seen = new Set<string>();
  const pool: { expression: string; meaning?: string }[] = [];
  for (const item of learningItems ?? []) {
    const expression = typeof item.normalized_key === "string" ? item.normalized_key.trim() : "";
    const key = expression.toLowerCase();
    if (!expression || seen.has(key)) continue;
    seen.add(key);
    const meaning = typeof item.answer === "string" ? item.answer.trim().slice(0, 120) : "";
    pool.push(meaning ? { expression, meaning } : { expression });
  }
  if (!pool.length) {
    return Response.json({ message: "This review has no words to build a story from yet." }, { status: 422 });
  }

  // Shuffle and take only 3-5 so the story stays natural (and varies per tap)
  // instead of cramming every expression in.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const targets = pool.slice(0, Math.min(pool.length, 3 + Math.floor(Math.random() * 3)));

  const credential = await getDeepSeekCredential(user.id);
  if (!credential) {
    return Response.json({ message: "Please connect DeepSeek in settings first." }, { status: 409 });
  }

  let story: string;
  try {
    story = await generateListeningStory(credential, targets);
  } catch {
    return Response.json(
      { message: "The story writer is temporarily unavailable. Please try again later." },
      { status: 502 },
    );
  }

  if (story.length > MAX_STORY_LENGTH) story = story.slice(0, MAX_STORY_LENGTH).trim();

  return Response.json(
    { story, expressions: targets.map((target) => target.expression) },
    { headers: { "cache-control": "no-store" } },
  );
}
