import { resolveAccountId } from "@/lib/account-aliases";
import { bearerToken, shanghaiDate, toScheduleItem, type LearningItemRecord } from "@/lib/srs";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, workerTokenHash } from "@/lib/worker";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ message: "缺少 Worker 令牌。" }, { status: 401 });

  const requestedSpace = new URL(request.url).searchParams.get("space")?.trim() ?? "";
  if (!requestedSpace || requestedSpace.length > 80) {
    return Response.json({ message: "space 必须是非空的知识库名称。" }, { status: 400 });
  }

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

  // Read under the canonical owner so a token registered on a secondary account
  // still sees the shared dataset (mirrors the web session and the push route).
  const ownerId = resolveAccountId(device.user_id);

  const { data: space, error: spaceError } = await admin
    .from("knowledge_spaces")
    .select("id,display_name")
    .eq("user_id", ownerId)
    .eq("slug", slugify(requestedSpace))
    .maybeSingle();

  if (spaceError) {
    console.error("Worker knowledge-space lookup failed", spaceError);
    return Response.json({ message: "无法读取知识库。" }, { status: 500 });
  }
  if (!space) return Response.json({ message: "知识库不存在。" }, { status: 404 });

  const { data, error } = await admin
    .from("learning_items")
    .select("id,normalized_key,type,cue,answer,example,priority,occurrences,attempts,correct,next_due,learned_on,last_shown,status,review_stage,correct_streak,last_result,last_answered_at")
    .eq("user_id", ownerId)
    .eq("knowledge_space_id", space.id)
    .order("next_due", { ascending: true })
    .limit(1000);

  if (error) {
    console.error("Worker SRS context lookup failed", error);
    return Response.json({ message: "无法读取复习排期。" }, { status: 500 });
  }

  const today = shanghaiDate();
  const items = ((data ?? []) as LearningItemRecord[]).map((item) => toScheduleItem(item, today));
  const due = items
    .filter((item) => item.selectable)
    .sort((left, right) => Number(right.pendingAnswer) - Number(left.pendingAnswer)
      || (left.pendingAnswer && right.pendingAnswer
        ? (right.lastShown ?? "").localeCompare(left.lastShown ?? "")
        : 0)
      || Number(left.isNew) - Number(right.isNew)
      || left.nextDue.localeCompare(right.nextDue)
      || PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
      || right.occurrences - left.occurrences
      || left.normalizedKey.localeCompare(right.normalizedKey));
  const upcoming = items
    .filter((item) => !item.isDue)
    .sort((left, right) => left.nextDue.localeCompare(right.nextDue)
      || PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
      || left.normalizedKey.localeCompare(right.normalizedKey));
  const deferred = items
    .filter((item) => item.isDue && !item.selectable)
    .sort((left, right) => left.nextDue.localeCompare(right.nextDue)
      || PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
      || left.normalizedKey.localeCompare(right.normalizedKey));

  await admin
    .from("worker_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);

  return Response.json({
    ok: true,
    today,
    knowledgeSpace: { id: space.id, name: space.display_name },
    schedule: {
      due,
      upcoming,
      deferred,
      counts: {
        total: items.length,
        due: due.length,
        upcoming: upcoming.length,
        deferred: deferred.length,
        pendingAnswer: items.filter((item) => item.pendingAnswer).length,
        new: items.filter((item) => item.isNew).length,
      },
      policy: {
        timezone: "Asia/Shanghai",
        selectable: "next_due <= today and last_shown < today",
        unanswered: "display does not move next_due; an unanswered due item returns daily until self-graded",
        priority: ["pending_answer", "graded_due", "unseen_due"],
        maxItemsPerReview: 10,
        maxUnseenPerReview: 2,
      },
    },
  });
}
