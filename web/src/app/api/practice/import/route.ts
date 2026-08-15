import { createHash } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { isIsoDate, shanghaiDate } from "@/lib/srs";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/worker";
import { hasMergedKnowledgePoint, isRecord, nonEmptyString, validateItems } from "@/lib/practice-payload";

// In-page paste importer: same accepted format as the Worker push, but authorised
// by the logged-in web session instead of a Worker token. Saves the batch as a
// practice session so it appears in "对话复习" for self-grading. No SRS write
// happens here — that only occurs when the learner self-grades an item.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "请先登录。" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return Response.json({ message: "导入格式无效：需要一个 english-review-sync JSON 对象。" }, { status: 400 });

  const displayName = nonEmptyString(body.space, 80);
  const practiceDate = nonEmptyString(body.practiceDate, 10);
  const today = shanghaiDate();
  if (!displayName) return Response.json({ message: "缺少 space 名称。" }, { status: 400 });
  if (!practiceDate || !isIsoDate(practiceDate) || practiceDate > today) {
    return Response.json({ message: "practiceDate 必须是今天或过去的上海日期（YYYY-MM-DD）。" }, { status: 400 });
  }

  const items = validateItems(body.items);
  if (!items || !items.length) {
    return Response.json({ message: "items 为空或格式无效；每项需要 normalizedKey、cue、answer，example 需含 3–8 个完整场景。" }, { status: 400 });
  }
  if (hasMergedKnowledgePoint(items)) {
    return Response.json({ message: "每个学习项的 normalizedKey 只能是一个独立知识点。" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: space, error: spaceError } = await admin
    .from("knowledge_spaces")
    .upsert({ user_id: user.id, slug: slugify(displayName), display_name: displayName }, { onConflict: "user_id,slug" })
    .select("id")
    .single();
  if (spaceError || !space) {
    console.error("Import knowledge-space upsert failed", spaceError);
    return Response.json({ message: "无法保存知识库。" }, { status: 500 });
  }

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
      user_id: user.id,
      knowledge_space_id: space.id,
      source: "chatgpt_chrome",
      practice_date: practiceDate,
      payload_hash: payloadHash,
      item_count: items.length,
    }, { onConflict: "user_id,source,payload_hash", ignoreDuplicates: true });
  if (sessionInsertError) {
    console.error("Import practice-session save failed", sessionInsertError);
    return Response.json({ message: "无法保存导入内容。" }, { status: 500 });
  }

  const { data: session, error: sessionError } = await admin
    .from("practice_sessions")
    .select("id")
    .eq("user_id", user.id)
    .eq("source", "chatgpt_chrome")
    .eq("payload_hash", payloadHash)
    .maybeSingle();
  if (sessionError || !session) {
    console.error("Import practice-session lookup failed", sessionError);
    return Response.json({ message: "无法确认导入内容已保存。" }, { status: 500 });
  }

  const { data: practiceItems, error: practiceItemsError } = await admin
    .from("practice_items")
    .upsert(items.map((item) => ({
      user_id: user.id,
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
    console.error("Import practice-item save failed", practiceItemsError);
    return Response.json({ message: "无法保存全部导入学习项。" }, { status: 500 });
  }

  const richItemCount = items.filter((item) => item.example?.trim().startsWith("{")).length;
  return Response.json({ ok: true, accepted: items.length, richItemCount, practiceSessionId: session.id });
}
