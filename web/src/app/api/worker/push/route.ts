import { createHash } from "node:crypto";
import { bearerToken, isIsoDate, shanghaiDate } from "@/lib/srs";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, workerTokenHash } from "@/lib/worker";

const ITEM_TYPES = ["fact", "concept", "decision", "quote", "vocabulary", "expression", "grammar", "error", "pronunciation"] as const;
const PRIORITIES = ["high", "medium", "low"] as const;

type ItemType = (typeof ITEM_TYPES)[number];
type Priority = (typeof PRIORITIES)[number];
type ValidatedItem = {
  normalizedKey: string;
  type: ItemType;
  cue: string;
  answer: string;
  example: string | null;
  priority: Priority;
  occurrences: number;
  dueDate: string | null;
  learnedOn: string | null;
};
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function normalizeExample(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && trimmed.length <= 20_000 ? trimmed : null;
  }
  if (!isRecord(value)) return null;

  const meaning = nonEmptyString(value.meaning, 2_000);
  const explanation = nonEmptyString(value.explanation, 6_000);
  const usageTip = nonEmptyString(value.usageTip, 4_000);
  if (!meaning || !explanation || !usageTip || !Array.isArray(value.examples) || value.examples.length < 3 || value.examples.length > 8) return null;

  const examples = value.examples.map((raw) => {
    if (!isRecord(raw)) return null;
    const scenario = nonEmptyString(raw.scenario, 500);
    const english = nonEmptyString(raw.english, 3_000);
    const chinese = nonEmptyString(raw.chinese, 3_000);
    return scenario && english && chinese ? { scenario, english, chinese } : null;
  });
  if (examples.some((example) => !example)) return null;

  const serialized = JSON.stringify({ meaning, explanation, usageTip, examples });
  return serialized.length <= 20_000 ? serialized : null;
}

function validateItems(value: unknown): ValidatedItem[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) return null;

  const items: ValidatedItem[] = [];
  const keys = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const normalizedKey = nonEmptyString(raw.normalizedKey, 240);
    const cue = nonEmptyString(raw.cue, 20_000);
    const answer = nonEmptyString(raw.answer, 50_000);
    if (!normalizedKey || !cue || !answer || keys.has(normalizedKey)) return null;
    if (typeof raw.type !== "string" || !ITEM_TYPES.includes(raw.type as ItemType)) return null;
    if (raw.priority !== undefined && (typeof raw.priority !== "string" || !PRIORITIES.includes(raw.priority as Priority))) return null;
    const example = normalizeExample(raw.example);
    if (raw.example !== undefined && raw.example !== null && !example) return null;
    if (raw.occurrences !== undefined && (!Number.isInteger(raw.occurrences) || Number(raw.occurrences) <= 0 || Number(raw.occurrences) > 1_000_000)) return null;
    if (raw.dueDate !== undefined && raw.dueDate !== null && !isIsoDate(raw.dueDate)) return null;
    if (raw.learnedOn !== undefined && raw.learnedOn !== null && !isIsoDate(raw.learnedOn)) return null;

    keys.add(normalizedKey);
    items.push({
      normalizedKey,
      type: raw.type as ItemType,
      cue,
      answer,
      example,
      priority: (raw.priority as Priority | undefined) ?? "medium",
      occurrences: raw.occurrences === undefined ? 1 : Number(raw.occurrences),
      dueDate: typeof raw.dueDate === "string" ? raw.dueDate : null,
      learnedOn: typeof raw.learnedOn === "string" ? raw.learnedOn : null,
    });
  }
  return items;
}

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
  if (!token) return Response.json({ message: "缺少 Worker 令牌。" }, { status: 401 });

  const admin = createAdminClient();
  const { data: device, error: deviceError } = await admin
    .from("worker_devices")
    .select("id,user_id")
    .eq("token_hash", workerTokenHash(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (deviceError) {
    console.error("Worker authentication failed", deviceError);
    return Response.json({ message: "无法验证 Worker 令牌。" }, { status: 500 });
  }
  if (!device) return Response.json({ message: "Worker 令牌无效或已撤销。" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return Response.json({ message: "推送格式无效。" }, { status: 400 });
  const displayName = nonEmptyString(body.space, 80);
  const practiceDate = body.practiceDate === undefined ? null : nonEmptyString(body.practiceDate, 10);
  const isGptPracticeSync = practiceDate !== null;
  const today = shanghaiDate();
  if (practiceDate !== null && (!isIsoDate(practiceDate) || practiceDate > today)) {
    return Response.json({ message: "练习日期必须是今天或过去的上海日期。" }, { status: 400 });
  }
  const items = validateItems(body.items);
  const review = body.review === undefined ? null : validateReview(body.review);
  if (!displayName || !items || (body.review !== undefined && !review) || (!items.length && !review) || (isGptPracticeSync && review)) {
    return Response.json({ message: "推送格式无效；space、学习项和复习包字段必须非空且唯一。" }, { status: 400 });
  }
  // Guard against merging several knowledge points into one item, but only on the
  // normalizedKey (the identity). The cue/answer are natural-language prose where
  // a slash is legitimate (e.g. the Chinese gloss "积分/额度" for one phrase).
  if (isGptPracticeSync && items.some((item) => /[;；/、]/.test(item.normalizedKey))) {
    return Response.json({ message: "每个学习项只能包含一个独立知识点；请拆分并列词汇、短语或语法点后重试。" }, { status: 400 });
  }
  const scheduledItems = items;
  const itemByKey = new Map(scheduledItems.map((item) => [item.normalizedKey, item]));
  const orderedReviewItems = review ? review.itemKeys.map((key) => itemByKey.get(key)) : [];
  if (review && (items.length !== review.itemKeys.length || orderedReviewItems.some((item) => !item))) {
    return Response.json({ message: "复习包中的 items 必须与 review.itemKeys 完整对应。" }, { status: 400 });
  }

  const { data: space, error: spaceError } = await admin
    .from("knowledge_spaces")
    .upsert({ user_id: device.user_id, slug: slugify(displayName), display_name: displayName }, { onConflict: "user_id,slug" })
    .select("id")
    .single();
  if (spaceError || !space) {
    console.error("Knowledge-space upsert failed", spaceError);
    return Response.json({ message: "无法保存知识库。" }, { status: 500 });
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
        user_id: device.user_id,
        knowledge_space_id: space.id,
        source: "chatgpt_chrome",
        practice_date: practiceDate,
        payload_hash: payloadHash,
        item_count: items.length,
      }, { onConflict: "user_id,source,payload_hash", ignoreDuplicates: true });
    if (sessionInsertError) {
      console.error("Practice-session save failed", sessionInsertError);
      return Response.json({ message: "无法保存对话练习。" }, { status: 500 });
    }
    const { data: session, error: sessionError } = await admin
      .from("practice_sessions")
      .select("id")
      .eq("user_id", device.user_id)
      .eq("source", "chatgpt_chrome")
      .eq("payload_hash", payloadHash)
      .maybeSingle();
    if (sessionError || !session) {
      console.error("Practice-session lookup failed", sessionError);
      return Response.json({ message: "无法确认对话练习已保存。" }, { status: 500 });
    }
    const { data: practiceItems, error: practiceItemsError } = await admin
      .from("practice_items")
      .upsert(items.map((item) => ({
        user_id: device.user_id,
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
      return Response.json({ message: "无法保存全部对话学习项。" }, { status: 500 });
    }
    const { error: jobsError } = await admin
      .from("generation_jobs")
      .upsert(practiceItems.flatMap((item) => ([
        { user_id: device.user_id, practice_item_id: item.id, kind: "enrichment" },
        { user_id: device.user_id, practice_item_id: item.id, kind: "tts_audio" },
      ])), { onConflict: "practice_item_id,kind", ignoreDuplicates: true });
    if (jobsError) {
      console.error("Generation-job queue failed", jobsError);
      return Response.json({ message: "对话已保存，但无法创建内容生成任务。" }, { status: 500 });
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
      .eq("user_id", device.user_id)
      .in("normalized_key", scheduledItems.map((item) => item.normalizedKey));
    if (existingItemsError) {
      console.error("Existing learning-item lookup failed", existingItemsError);
      return Response.json({ message: "无法检查已有学习项。" }, { status: 500 });
    }
    if ((existingItems ?? []).some((item) => item.knowledge_space_id !== space.id)) {
      return Response.json(
        { message: "相同学习项已经属于另一个知识库，不能静默移动。" },
        { status: 409 },
      );
    }
    const insertRows = scheduledItems.map((item) => ({
      user_id: device.user_id,
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
      return Response.json({ message: "无法创建学习项。" }, { status: 500 });
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
      .eq("user_id", device.user_id)
      .eq("knowledge_space_id", space.id)
      .eq("normalized_key", item.normalizedKey)
      .select("id")
      .maybeSingle()));
    const failedUpdate = updates.find((result) => result.error || !result.data);
    if (failedUpdate) {
      console.error("Learning-item content update failed", failedUpdate.error);
      return Response.json({ message: "无法同步学习项内容。" }, { status: 500 });
    }
  }

  let reviewSaved = false;
  let reviewId: string | null = null;
  let reviewDate: string | null = null;
  if (review) {
    // Content and mappings are saved in one PostgreSQL transaction. The RPC
    // also preserves the content of any card already graded in this review.
    const { data: savedReviewId, error: saveError } = await admin.rpc("save_daily_review_with_items", {
      p_user_id: device.user_id,
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
          { message: "无法安全更新：必须保留全部已发布题目，且新增题目仍需处于待复习状态。" },
          { status: 409 },
        );
      }
      if (saveError.code === "22023") {
        return Response.json({ message: "复习题目映射无效。" }, { status: 400 });
      }
      if (saveError.code === "42501") {
        return Response.json({ message: "知识库不属于当前 Worker 用户。" }, { status: 403 });
      }
      console.error("Atomic daily-review save failed", saveError);
      return Response.json({ message: "无法保存每日复习。" }, { status: 500 });
    }
    if (typeof savedReviewId !== "string" || !savedReviewId) {
      console.error("Atomic daily-review save returned no review id", { savedReviewId });
      return Response.json({ message: "无法确认每日复习已保存。" }, { status: 500 });
    }
    reviewSaved = true;
    reviewId = savedReviewId;
    reviewDate = review.reviewDate;
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
