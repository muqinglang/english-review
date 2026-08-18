import { currentUser } from "@/lib/auth";
import { isUuid, SELF_GRADE_RESULTS } from "@/lib/srs";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Please sign in first." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const practiceItemId = body?.practiceItemId;
  const requestId = body?.requestId;
  const result = body?.result;
  const submittedText = typeof body?.submittedText === "string" ? body.submittedText : "";
  if (!isUuid(practiceItemId) || !isUuid(requestId) || typeof result !== "string" || !SELF_GRADE_RESULTS.includes(result as typeof SELF_GRADE_RESULTS[number]) || submittedText.length > 10_000) {
    return Response.json({ message: "Invalid self-grade request format." }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("record_practice_attempt", {
    p_user_id: user.id,
    p_practice_item_id: practiceItemId,
    p_request_id: requestId,
    p_result: result,
    p_submitted_text: submittedText,
  });
  if (error) {
    if (["22023", "42501"].includes(error.code ?? "")) return Response.json({ message: "Conversation review item not found or the request is invalid." }, { status: 400 });
    if (error.code === "23505") return Response.json({ message: "This request has already been used for another self-grade." }, { status: 409 });
    console.error("Practice self-grade RPC failed", error);
    return Response.json({ message: "Unable to save this conversation review result." }, { status: 500 });
  }
  const attempt = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!attempt) return Response.json({ message: "Unable to confirm this conversation review result." }, { status: 500 });
  return Response.json({ ok: true, nextDue: attempt.next_due, reviewStage: attempt.review_stage, result: attempt.result, idempotent: attempt.idempotent });
}
