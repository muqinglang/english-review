import { currentUser } from "@/lib/auth";
import { parseSelfGradeRequest, type SrsAttemptRecord } from "@/lib/srs";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Please sign in first." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const input = parseSelfGradeRequest(body);
  if (!input) {
    return Response.json({ message: "Invalid grade request format." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: reviewItem, error: ownershipError } = await admin
    .from("review_items")
    .select("id,learning_item_id")
    .eq("id", input.reviewItemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownershipError) {
    console.error("Review item ownership check failed", ownershipError);
    return Response.json({ message: "Unable to verify review item." }, { status: 500 });
  }
  if (!reviewItem) return Response.json({ message: "Review item not found." }, { status: 404 });

  const { data, error } = await admin.rpc("record_review_attempt", {
    p_user_id: user.id,
    p_review_item_id: input.reviewItemId,
    p_request_id: input.requestId,
    p_result: input.result,
    p_submitted_text: input.submittedText,
  });

  if (error) {
    if (error.code === "23505") {
      return Response.json({ message: "This request ID has already been used for another attempt." }, { status: 409 });
    }
    if (error.code === "22023") {
      return Response.json({ message: "Invalid grade request format." }, { status: 400 });
    }
    if (error.code === "42501") {
      return Response.json({ message: "Review item not found." }, { status: 404 });
    }
    if (error.code === "55000") {
      return Response.json({ message: "This knowledge point was already graded on a newer card; please refresh." }, { status: 409 });
    }
    console.error("Self-grade RPC failed", error);
    return Response.json({ message: "Unable to save this review result." }, { status: 500 });
  }

  const attempt = (Array.isArray(data) ? data[0] : data) as SrsAttemptRecord | undefined;
  if (!attempt || attempt.learning_item_id !== reviewItem.learning_item_id) {
    console.error("Self-grade RPC returned an unexpected learning item", { attempt, reviewItem });
    return Response.json({ message: "Unable to confirm this review result." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    nextDue: attempt.next_due,
    reviewStage: attempt.review_stage,
    status: attempt.item_status,
    lastResult: attempt.result,
    learningItem: {
      id: attempt.learning_item_id,
      correctStreak: attempt.correct_streak,
      lastAnsweredAt: attempt.answered_at,
    },
    attempt: {
      id: attempt.attempt_id,
      requestId: attempt.request_id,
      idempotent: attempt.idempotent,
    },
  });
}
