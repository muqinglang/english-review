import { createHash } from "node:crypto";
import { resolveAccountId } from "@/lib/account-aliases";
import { bearerToken, isIsoDate, shanghaiDate } from "@/lib/srs";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, workerTokenHash } from "@/lib/worker";
import { hasMergedKnowledgePoint, isRecord, nonEmptyString, validateItems } from "@/lib/practice-payload";

type AudioCard = { id: string; prompt: string; normal: string; slow?: string };
type ValidatedReview = {
  reviewDate: string;
  title: string;
  contentMarkdown: string;
  audioCards: AudioCard[];
  durationMinutes: string;
  level: string;
  itemKeys: string[];
};

function validateReview(value: unknown): ValidatedReview | null {
  if (!isRecord(value) || !isIsoDate(value.reviewDate)) return null;
  const title = nonEmptyString(value.title, 500);
  const contentMarkdown = nonEmptyString(value.contentMarkdown, 100_000);
  const durationMinutes = value.durationMinutes === undefined ? "8–12" : nonEmptyString(value.durationMinutes, 40);
  const level = value.level === undefined ? "B1" : nonEmptyString(value.level, 40);
  if (!title || !contentMarkdown || !durationMinutes || !level) return null;

  if (!Array.isArray(value.itemKeys) || value.itemKeys.length === 0 || value.itemKeys.length > 100) return null;
  const itemKeys = value.itemKeys.map((key) => nonEmptyString(key, 240));
  if (itemKeys.some((key) => !key)) return null;
  const normalizedItemKeys = itemKeys as string[];
  if (new Set(normalizedItemKeys).size !== normalizedItemKeys.length) return null;

  if (!Array.isArray(value.audioCards) || value.audioCards.length === 0 || value.audioCards.length > 50) return null;
  const audioCards: AudioCard[] = [];
  const cardIds = new Set<string>();
  for (const raw of value.audioCards) {
    if (!isRecord(raw)) return null;
    const id = nonEmptyString(raw.id, 240);
    const prompt = nonEmptyString(raw.prompt, 2_000);
    const normal = nonEmptyString(raw.normal, 10_000);
    if (!id || !prompt || !normal || cardIds.has(id)) return null;
    if (raw.slow !== undefined && typeof raw.slow !== "string") return null;
    if (typeof raw.slow === "string" && raw.slow.length > 10_000) return null;
    const slow = typeof raw.slow === "string" ? raw.slow.trim() : "";
    cardIds.add(id);
    audioCards.push({ id, prompt, normal, ...(slow ? { slow } : {}) });
  }
  if (normalizedItemKeys.length !== audioCards.length) return null;

  return {
    reviewDate: value.reviewDate,
    title,
    contentMarkdown,
    audioCards,
    durationMinutes,
    level,
    itemKeys: normalizedItemKeys,
  };
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ message: "Missing Worker token." }, { status: 401 });

  const admin = createAdminClient();
  const { data: device, error: deviceError } = await admin
    .from("worker_devices")
    .select("id,user_id")
    .eq("token_hash", workerTokenHash(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (deviceError) {
    console.error("Worker authentication failed", deviceError);
    return Response.json({ message: "Unable to verify Worker token." }, { status: 500 });
  }
  if (!device) return Response.json({ message: "Worker token is invalid or revoked." }, { status: 401 });

  // A device row may hold a secondary account id (e.g. a token registered before
  // account aliasing shipped). Resolve to the canonical owner so Worker syncs land
  // under the same dataset the web session reads — otherwise data is stranded on
  // the secondary account and never appears in review. device.id is the device
  // row PK and stays as-is for last_seen bookkeeping below.
  const ownerId = resolveAccountId(device.user_id);

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return Response.json({ message: "Invalid push format." }, { status: 400 });
  const displayName = nonEmptyString(body.space, 80);
  const practiceDate = body.practiceDate === undefined ? null : nonEmptyString(body.practiceDate, 10);
  const isGptPracticeSync = practiceDate !== null;
  const today = shanghaiDate();
  if (practiceDate !== null && (!isIsoDate(practiceDate) || practiceDate > today)) {
    return Response.json({ message: "Practice date must be today or a past Shanghai date." }, { status: 400 });
  }
  const items = validateItems(body.items);
  const review = body.review === undefined ? null : validateReview(body.review);
  if (!displayName || !items || (body.review !== undefined && !review) || (!items.length && !review) || (isGptPracticeSync && review)) {
    return Response.json({ message: "Invalid push format; the space, learning items, and review package fields must be non-empty and unique." }, { status: 400 });
  }
  // Guard against merging several knowledge points into one item, but only on the
  // normalizedKey (the identity). The cue/answer are natural-language prose where
  // a slash is legitimate (e.g. the Chinese gloss "积分/额度" for one phrase).
  if (isGptPracticeSync && hasMergedKnowledgePoint(items)) {
    return Response.json({ message: "Each learning item may contain only one distinct knowledge point; split combined words, phrases, or grammar points and try again." }, { status: 400 });
  }
  const scheduledItems = items;
  const itemByKey = new Map(scheduledItems.map((item) => [item.normalizedKey, item]));
  const orderedReviewItems = review ? review.itemKeys.map((key) => itemByKey.get(key)) : [];
  if (review && (items.length !== review.itemKeys.length || orderedReviewItems.some((item) => !item))) {
    return Response.json({ message: "The items in the review package must correspond exactly to review.itemKeys." }, { status: 400 });
  }

  const { data: space, error: spaceError } = await admin
    .from("knowledge_spaces")
    .upsert({ user_id: ownerId, slug: slugify(displayName), display_name: displayName }, { onConflict: "user_id,slug" })
    .select("id")
    .single();
  if (spaceError || !space) {
    console.error("Knowledge-space upsert failed", spaceError);
    return Response.json({ message: "Unable to save knowledge space." }, { status: 500 });
  }

  // A ChatGPT conversation is a short-term practice session, not an immediate
  // long-term SRS item. It enters learning_items only after the learner gives
  // the first self-grade in the "yesterday conversation" queue.
  if (isGptPracticeSync && practiceDate) {
    const payloadHash = createHash("sha256")
      .update(JSON.stringify({ practiceDate, items: items.map((item) => ({
        normalizedKey: item.normalizedKey,
        type: item.type,
        cue: item.cue,
        answer: item.answer,
        example: item.example,
        priority: item.priority,
        occurrences: item.occurrences,
      })) }), "utf8")
      .digest("hex");
    const { error: sessionInsertError } = await admin
      .from("practice_sessions")
      .upsert({
        user_id: ownerId,
        knowledge_space_id: space.id,
        source: "chatgpt_chrome",
        practice_date: practiceDate,
        payload_hash: payloadHash,
        item_count: items.length,
      }, { onConflict: "user_id,source,payload_hash", ignoreDuplicates: true });
    if (sessionInsertError) {
      console.error("Practice-session save failed", sessionInsertError);
      return Response.json({ message: "Unable to save conversation practice." }, { status: 500 });
    }
    const { data: session, error: sessionError } = await admin
      .from("practice_sessions")
      .select("id")
      .eq("user_id", ownerId)
      .eq("source", "chatgpt_chrome")
      .eq("payload_hash", payloadHash)
      .maybeSingle();
    if (sessionError || !session) {
      console.error("Practice-session lookup failed", sessionError);
      return Response.json({ message: "Unable to confirm the conversation practice was saved." }, { status: 500 });
    }
    const { data: practiceItems, error: practiceItemsError } = await admin
      .from("practice_items")
      .upsert(items.map((item) => ({
        user_id: ownerId,
        practice_session_id: session.id,
        normalized_key: item.normalizedKey,
        type: item.type,
        cue: item.cue,
        answer: item.answer,
        example: item.example,
        priority: item.priority,
        occurrences: item.occurrences,
      })), { onConflict: "practice_session_id,normalized_key" })
      .select("id");
    if (practiceItemsError || !practiceItems || practiceItems.length !== items.length) {
      console.error("Practice-item save failed", practiceItemsError);
      return Response.json({ message: "Unable to save all conversation learning items." }, { status: 500 });
    }
    const { error: jobsError } = await admin
      .from("generation_jobs")
      .upsert(practiceItems.flatMap((item) => ([
        { user_id: ownerId, practice_item_id: item.id, kind: "enrichment" },
        { user_id: ownerId, practice_item_id: item.id, kind: "tts_audio" },
      ])), { onConflict: "practice_item_id,kind", ignoreDuplicates: true });
    if (jobsError) {
      console.error("Generation-job queue failed", jobsError);
      return Response.json({ message: "Conversation saved, but content generation jobs could not be created." }, { status: 500 });
    }
    await admin.from("worker_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
    const richItemCount = items.filter((item) => item.example?.trim().startsWith("{")).length;
    return Response.json({ ok: true, knowledgeSpace: displayName, accepted: items.length, richItemCount, practiceSessionId: session.id, reviewSaved: false, reviewId: null, reviewDate: null });
  }

  const now = new Date().toISOString();
  // Standalone item pushes keep their existing behavior. Review pushes use the
  // transactional RPC below so item content and card mappings cannot diverge.
  if (scheduledItems.length && !review) {
    const { data: existingItems, error: existingItemsError } = await admin
      .from("learning_items")
      .select("normalized_key,knowledge_space_id")
      .eq("user_id", ownerId)
      .in("normalized_key", scheduledItems.map((item) => item.normalizedKey));
    if (existingItemsError) {
      console.error("Existing learning-item lookup failed", existingItemsError);
      return Response.json({ message: "Unable to check existing learning items." }, { status: 500 });
    }
    if ((existingItems ?? []).some((item) => item.knowledge_space_id !== space.id)) {
      return Response.json(
        { message: "This learning item already belongs to another knowledge space and cannot be moved silently." },
        { status: 409 },
      );
    }
    const insertRows = scheduledItems.map((item) => ({
      user_id: ownerId,
      knowledge_space_id: space.id,
      normalized_key: item.normalizedKey,
      type: item.type,
      cue: item.cue,
      answer: item.answer,
      example: item.example,
      priority: item.priority,
      occurrences: item.occurrences,
      next_due: item.dueDate ?? today,
      learned_on: item.learnedOn ?? today,
    }));
    const { error: insertError } = await admin
      .from("learning_items")
      .upsert(insertRows, { onConflict: "user_id,normalized_key", ignoreDuplicates: true });
    if (insertError) {
      console.error("Learning-item insert failed", insertError);
      return Response.json({ message: "Unable to create learning items." }, { status: 500 });
    }

    // Only content/source fields are updated here. SRS state and next_due are
    // intentionally omitted so a Worker sync cannot undo a learner's answer.
    const updates = await Promise.all(scheduledItems.map((item) => admin
      .from("learning_items")
      .update({
        type: item.type,
        cue: item.cue,
        answer: item.answer,
        example: item.example,
        priority: item.priority,
        updated_at: now,
      })
      .eq("user_id", ownerId)
      .eq("knowledge_space_id", space.id)
      .eq("normalized_key", item.normalizedKey)
      .select("id")
      .maybeSingle()));
    const failedUpdate = updates.find((result) => result.error || !result.data);
    if (failedUpdate) {
      console.error("Learning-item content update failed", failedUpdate.error);
      return Response.json({ message: "Unable to sync learning item content." }, { status: 500 });
    }
  }

  let reviewSaved = false;
  let reviewId: string | null = null;
  let reviewDate: string | null = null;
  if (review) {
    // Content and mappings are saved in one PostgreSQL transaction. The RPC
    // also preserves the content of any card already graded in this review.
    const { data: savedReviewId, error: saveError } = await admin.rpc("save_daily_review_with_items", {
      p_user_id: ownerId,
      p_knowledge_space_id: space.id,
      p_review_date: review.reviewDate,
      p_content_json: {
        format: "markdown",
        title: review.title,
        markdown: review.contentMarkdown,
        durationMinutes: review.durationMinutes,
        level: review.level,
      },
      p_audio_script_json: { cards: review.audioCards },
      p_learning_items_json: orderedReviewItems.map((item) => ({
        normalized_key: item!.normalizedKey,
        type: item!.type,
        cue: item!.cue,
        answer: item!.answer,
        example: item!.example,
        priority: item!.priority,
        occurrences: item!.occurrences,
        due_date: item!.dueDate,
        learned_on: item!.learnedOn,
      })),
    });
    if (saveError) {
      if (saveError.code === "55000") {
        return Response.json(
          { message: "Cannot update safely: all published items must be retained, and any new items must still be pending review." },
          { status: 409 },
        );
      }
      if (saveError.code === "22023") {
        return Response.json({ message: "Invalid review item mapping." }, { status: 400 });
      }
      if (saveError.code === "42501") {
        return Response.json({ message: "The knowledge space does not belong to the current Worker user." }, { status: 403 });
      }
      console.error("Atomic daily-review save failed", saveError);
      return Response.json({ message: "Unable to save the daily review." }, { status: 500 });
    }
    if (typeof savedReviewId !== "string" || !savedReviewId) {
      console.error("Atomic daily-review save returned no review id", { savedReviewId });
      return Response.json({ message: "Unable to confirm the daily review was saved." }, { status: 500 });
    }
    reviewSaved = true;
    reviewId = savedReviewId;
    reviewDate = review.reviewDate;

    // The save RPC inserts content_json only on first create (on conflict do
    // nothing, to keep already-graded cards immutable). Re-pushing the same date
    // must still be able to refresh purely-presentational fields (title, markdown,
    // duration, level, audio script), so update them here. The gradeable
    // review_items the RPC manages are untouched.
    const { error: refreshError } = await admin
      .from("reviews")
      .update({
        content_json: {
          format: "markdown",
          title: review.title,
          markdown: review.contentMarkdown,
          durationMinutes: review.durationMinutes,
          level: review.level,
        },
        audio_script_json: { cards: review.audioCards },
      })
      .eq("id", savedReviewId)
      .eq("user_id", ownerId);
    if (refreshError) {
      console.error("Daily-review content refresh failed", refreshError);
      return Response.json({ message: "The review was saved but its display content could not be refreshed." }, { status: 500 });
    }
  }

  await admin
    .from("worker_devices")
    .update({ last_seen_at: now })
    .eq("id", device.id);
  return Response.json({
    ok: true,
    knowledgeSpace: displayName,
    accepted: scheduledItems.length,
    reviewSaved,
    reviewId,
    reviewDate,
  });
}
