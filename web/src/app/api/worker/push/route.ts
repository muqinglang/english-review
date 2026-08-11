import { bearerToken, isIsoDate, shanghaiDate } from "@/lib/srs";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, workerTokenHash } from "@/lib/worker";

const ITEM_TYPES = ["fact", "concept", "decision", "quote", "vocabulary", "expression", "error", "pronunciation"] as const;
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
    if (raw.example !== undefined && raw.example !== null && typeof raw.example !== "string") return null;
    if (typeof raw.example === "string" && raw.example.length > 20_000) return null;
    if (raw.occurrences !== undefined && (!Number.isInteger(raw.occurrences) || Number(raw.occurrences) <= 0 || Number(raw.occurrences) > 1_000_000)) return null;
    if (raw.dueDate !== undefined && raw.dueDate !== null && !isIsoDate(raw.dueDate)) return null;
    if (raw.learnedOn !== undefined && raw.learnedOn !== null && !isIsoDate(raw.learnedOn)) return null;

    keys.add(normalizedKey);
    items.push({
      normalizedKey,
      type: raw.type as ItemType,
      cue,
      answer,
      example: typeof raw.example === "string" ? raw.example.trim() || null : null,
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
  const items = validateItems(body.items);
  const review = body.review === undefined ? null : validateReview(body.review);
  if (!displayName || !items || (body.review !== undefined && !review) || (!items.length && !review)) {
    return Response.json({ message: "推送格式无效；space、学习项和复习包字段必须非空且唯一。" }, { status: 400 });
  }
  const itemByKey = new Map(items.map((item) => [item.normalizedKey, item]));
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

  const now = new Date().toISOString();
  const today = shanghaiDate();
  // Standalone item pushes keep their existing behavior. Review pushes use the
  // transactional RPC below so item content and card mappings cannot diverge.
  if (items.length && !review) {
    const { data: existingItems, error: existingItemsError } = await admin
      .from("learning_items")
      .select("normalized_key,knowledge_space_id")
      .eq("user_id", device.user_id)
      .in("normalized_key", items.map((item) => item.normalizedKey));
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
    const insertRows = items.map((item) => ({
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
    const updates = await Promise.all(items.map((item) => admin
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
    accepted: items.length,
    reviewSaved,
    reviewId,
    reviewDate,
  });
}
