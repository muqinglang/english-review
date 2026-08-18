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
    return { error: "Invalid learning item format." };
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
    return { error: "The lookup key is generated automatically by the system and cannot be used to modify existing ledger items." };
  }
  const key = stableCaptureKey(type, cue);

  if (!UUID_PATTERN.test(knowledgeSpaceId)) return { error: "Please select a valid knowledge space." };
  if (!cue || cue.length > 500) return { error: "The cue must be 1–500 characters." };
  if (!answer || answer.length > 5000) return { error: "The answer must be 1–5000 characters." };
  if (example.length > 2000) return { error: "The example cannot exceed 2000 characters." };
  if (!ITEM_TYPES.has(type)) return { error: "Invalid learning type." };
  if (!PRIORITIES.has(priority)) return { error: "Invalid priority." };
  if (!isCalendarDate(learnedOn) || learnedOn > shanghaiToday()) {
    return { error: "The learned-on date must be today or a valid past date." };
  }
  if (key.length < 2 || key.length > 160 || /[\u0000-\u001f\u007f]/.test(key)) {
    return { error: "The stable lookup key must be 2–160 characters and cannot contain control characters." };
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
  if (!user) return Response.json({ message: "Please sign in first." }, { status: 401 });

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
    return Response.json({ message: "Unable to initialize user profile." }, { status: 500 });
  }

  const { data: space, error: spaceError } = await admin
    .from("knowledge_spaces")
    .select("id")
    .eq("id", parsed.knowledgeSpaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (spaceError) {
    console.error("Learning capture knowledge-space lookup failed", spaceError);
    return Response.json({ message: "Unable to verify knowledge space." }, { status: 500 });
  }
  if (!space) return Response.json({ message: "Knowledge space not found or does not belong to the current account." }, { status: 404 });

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
        { message: "This learning item already exists in another knowledge space; switch knowledge spaces or use a different lookup key." },
        { status: 409 },
      );
    }
    if (error.code === "22023") {
      return Response.json({ message: "The learning item failed validation." }, { status: 400 });
    }
    console.error("Learning capture RPC failed", error);
    return Response.json({ message: "Failed to save the learning item." }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || (row.capture_action !== "created" && row.capture_action !== "updated")) {
    console.error("Learning capture RPC returned an invalid result", data);
    return Response.json({ message: "Failed to save the learning item." }, { status: 500 });
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
