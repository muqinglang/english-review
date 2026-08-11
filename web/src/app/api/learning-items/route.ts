import { createHash } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ITEM_TYPES = new Set([
  "fact",
  "concept",
  "decision",
  "quote",
  "vocabulary",
  "expression",
  "error",
  "pronunciation",
]);
const PRIORITIES = new Set(["high", "medium", "low"]);

type CaptureInput = {
  knowledgeSpaceId: string;
  cue: string;
  answer: string;
  example: string | null;
  type: string;
  priority: string;
  learnedOn: string;
  normalizedKey: string;
};

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function stableCaptureKey(type: string, cue: string) {
  const normalizedCue = cue
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/[\u0000-\u001f]/g, "");
  const digest = createHash("sha256")
    .update(`${type}\n${normalizedCue}`, "utf8")
    .digest("hex");
  return `capture:${type}:${digest.slice(0, 24)}`;
}

function parseInput(body: unknown): CaptureInput | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "学习内容格式无效。" };
  }

  const input = body as Record<string, unknown>;
  const knowledgeSpaceId = typeof input.knowledgeSpaceId === "string"
    ? input.knowledgeSpaceId.trim()
    : "";
  const cue = typeof input.cue === "string" ? input.cue.trim() : "";
  const answer = typeof input.answer === "string" ? input.answer.trim() : "";
  const example = typeof input.example === "string" ? input.example.trim() : "";
  const type = typeof input.type === "string" ? input.type : "";
  const priority = typeof input.priority === "string" ? input.priority : "";
  const learnedOn = input.learnedOn === undefined
    ? shanghaiToday()
    : typeof input.learnedOn === "string"
      ? input.learnedOn
      : "";
  if (input.normalizedKey !== undefined) {
    return { error: "检索键由系统自动生成，不能用于修改旧台账项目。" };
  }
  const key = stableCaptureKey(type, cue);

  if (!UUID_PATTERN.test(knowledgeSpaceId)) return { error: "请选择有效的知识库。" };
  if (!cue || cue.length > 500) return { error: "题目必须为 1–500 个字符。" };
  if (!answer || answer.length > 5000) return { error: "答案必须为 1–5000 个字符。" };
  if (example.length > 2000) return { error: "例句不能超过 2000 个字符。" };
  if (!ITEM_TYPES.has(type)) return { error: "学习类型无效。" };
  if (!PRIORITIES.has(priority)) return { error: "优先级无效。" };
  if (!isCalendarDate(learnedOn) || learnedOn > shanghaiToday()) {
    return { error: "学习日期必须是今天或过去的有效日期。" };
  }
  if (key.length < 2 || key.length > 160 || /[\u0000-\u001f\u007f]/.test(key)) {
    return { error: "稳定检索键必须为 2–160 个字符，且不能包含控制字符。" };
  }

  return {
    knowledgeSpaceId,
    cue,
    answer,
    example: example || null,
    type,
    priority,
    learnedOn,
    normalizedKey: key,
  };
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "请先登录。" }, { status: 401 });

  const parsed = parseInput(await request.json().catch(() => null));
  if ("error" in parsed) {
    return Response.json({ message: parsed.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) {
    console.error("Learning capture profile initialization failed", profileError);
    return Response.json({ message: "无法初始化用户资料。" }, { status: 500 });
  }

  const { data: space, error: spaceError } = await admin
    .from("knowledge_spaces")
    .select("id")
    .eq("id", parsed.knowledgeSpaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (spaceError) {
    console.error("Learning capture knowledge-space lookup failed", spaceError);
    return Response.json({ message: "无法验证知识库。" }, { status: 500 });
  }
  if (!space) return Response.json({ message: "知识库不存在或不属于当前账号。" }, { status: 404 });

  const { data, error } = await admin.rpc("capture_learning_item", {
    p_user_id: user.id,
    p_knowledge_space_id: parsed.knowledgeSpaceId,
    p_normalized_key: parsed.normalizedKey,
    p_type: parsed.type,
    p_cue: parsed.cue,
    p_answer: parsed.answer,
    p_example: parsed.example,
    p_priority: parsed.priority,
    p_learned_on: parsed.learnedOn,
  });

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { message: "相同学习项已存在于另一个知识库；请切换知识库或填写不同的检索键。" },
        { status: 409 },
      );
    }
    if (error.code === "22023") {
      return Response.json({ message: "学习内容未通过校验。" }, { status: 400 });
    }
    console.error("Learning capture RPC failed", error);
    return Response.json({ message: "保存学习内容失败。" }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || (row.capture_action !== "created" && row.capture_action !== "updated")) {
    console.error("Learning capture RPC returned an invalid result", data);
    return Response.json({ message: "保存学习内容失败。" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    action: row.capture_action,
    itemId: row.learning_item_id,
    normalizedKey: parsed.normalizedKey,
    learnedOn: row.learned_on,
    nextDue: row.next_due,
    occurrences: row.occurrences,
  }, {
    status: row.capture_action === "created" ? 201 : 200,
    headers: { "cache-control": "no-store" },
  });
}
