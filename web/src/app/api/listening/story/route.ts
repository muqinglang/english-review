import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateListeningStory, getDeepSeekCredential } from "@/lib/deepseek";

export const runtime = "nodejs";

// Keep in sync with /api/tts/speak MAX_TEXT_LENGTH so the generated story can
// always be voiced in a single clip by the learner's TTS provider.
const MAX_STORY_LENGTH = 600;
const MAX_WORDS = 20;

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
    .select("id,cue")
    .eq("user_id", user.id)
    .in("id", learningItemIds);
  if (learningError) {
    return Response.json({ message: "Unable to load this review's words." }, { status: 500 });
  }

  // `cue` holds the English word/phrase being learned (the front of each card).
  const seen = new Set<string>();
  const words: string[] = [];
  for (const item of learningItems ?? []) {
    const word = typeof item.cue === "string" ? item.cue.trim() : "";
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length >= MAX_WORDS) break;
  }
  if (!words.length) {
    return Response.json({ message: "This review has no words to build a story from yet." }, { status: 422 });
  }

  const credential = await getDeepSeekCredential(user.id);
  if (!credential) {
    return Response.json({ message: "Please connect DeepSeek in settings first." }, { status: 409 });
  }

  let story: string;
  try {
    story = await generateListeningStory(credential, words);
  } catch {
    return Response.json(
      { message: "The story writer is temporarily unavailable. Please try again later." },
      { status: 502 },
    );
  }

  if (story.length > MAX_STORY_LENGTH) story = story.slice(0, MAX_STORY_LENGTH).trim();

  return Response.json(
    { story, words },
    { headers: { "cache-control": "no-store" } },
  );
}
