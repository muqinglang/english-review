import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, workerTokenHash } from "@/lib/worker";

type Item = { normalizedKey: string; type: string; cue: string; answer: string; example?: string; priority?: "high" | "medium" | "low"; dueDate?: string };
type AudioCard = { id: string; prompt: string; normal: string; slow?: string };
type DailyReview = { reviewDate: string; title: string; contentMarkdown: string; audioCards?: AudioCard[]; durationMinutes?: string; level?: string };

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return Response.json({ message: "缺少 Worker 令牌。" }, { status: 401 });
  const admin = createAdminClient();
  const { data: device } = await admin.from("worker_devices").select("id,user_id").eq("token_hash", workerTokenHash(token)).is("revoked_at", null).maybeSingle();
  if (!device) return Response.json({ message: "Worker 令牌无效或已撤销。" }, { status: 401 });
  const body = await request.json().catch(() => null) as { space?: string; items?: Item[]; review?: DailyReview } | null;
  const items = body?.items ?? [];
  const review = body?.review;
  if (!body || !Array.isArray(items) || items.length > 100 || (!items.length && !review)) return Response.json({ message: "推送格式无效；需要 items 或 review。" }, { status: 400 });
  if (items.some((item) => !item || typeof item.normalizedKey !== "string" || typeof item.cue !== "string" || typeof item.answer !== "string")) {
    return Response.json({ message: "每项都需要 normalizedKey、cue 与 answer。" }, { status: 400 });
  }
  const displayName = typeof body.space === "string" && body.space.trim() ? body.space.trim().slice(0, 80) : "General";
  const { data: space, error: spaceError } = await admin.from("knowledge_spaces").upsert({ user_id: device.user_id, slug: slugify(displayName), display_name: displayName }, { onConflict: "user_id,slug" }).select("id").single();
  if (spaceError || !space) return Response.json({ message: "无法保存知识库。" }, { status: 500 });
  const rows = items.map((item) => ({ user_id: device.user_id, knowledge_space_id: space.id, normalized_key: item.normalizedKey.slice(0, 240), type: item.type, cue: item.cue, answer: item.answer, example: item.example ?? null, priority: item.priority ?? "medium", next_due: item.dueDate ?? new Date().toISOString().slice(0, 10) }));
  if (rows.some((row) => !row.normalized_key || !row.cue || !row.answer)) return Response.json({ message: "每项都需要非空的 normalizedKey、cue 与 answer。" }, { status: 400 });
  if (rows.length) {
    const { error } = await admin.from("learning_items").upsert(rows, { onConflict: "user_id,normalized_key", ignoreDuplicates: false });
    if (error) return Response.json({ message: "无法保存学习项。" }, { status: 500 });
  }
  if (review) {
    const cards = review.audioCards ?? [];
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(review.reviewDate);
    const validCards = Array.isArray(cards) && cards.length <= 50 && cards.every((card) => card.id && card.prompt && card.normal);
    if (!validDate || !review.title?.trim() || !review.contentMarkdown?.trim() || review.contentMarkdown.length > 100_000 || !validCards) {
      return Response.json({ message: "每日复习包格式无效。" }, { status: 400 });
    }
    const { error: reviewError } = await admin.from("reviews").upsert({
      user_id: device.user_id,
      knowledge_space_id: space.id,
      review_date: review.reviewDate,
      status: "ready",
      content_json: { format: "markdown", title: review.title.trim(), markdown: review.contentMarkdown, durationMinutes: review.durationMinutes ?? "8–12", level: review.level ?? "B1" },
      audio_script_json: { cards },
    }, { onConflict: "user_id,knowledge_space_id,review_date" });
    if (reviewError) return Response.json({ message: "无法保存每日复习。" }, { status: 500 });
  }
  await admin.from("worker_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return Response.json({ ok: true, knowledgeSpace: displayName, accepted: rows.length, reviewSaved: Boolean(review) });
}
