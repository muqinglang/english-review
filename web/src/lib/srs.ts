export const SELF_GRADE_RESULTS = ["incorrect", "partial", "correct"] as const;

export type SelfGradeResult = (typeof SELF_GRADE_RESULTS)[number];

export type SelfGradeRequest = {
  reviewItemId: string;
  requestId: string;
  result: SelfGradeResult;
  submittedText: string;
};

export type SrsAttemptRecord = {
  attempt_id: string;
  learning_item_id: string;
  request_id: string;
  result: SelfGradeResult;
  review_stage: number;
  correct_streak: number;
  next_due: string;
  item_status: string;
  answered_at: string;
  idempotent: boolean;
};

export type LearningItemRecord = {
  id: string;
  normalized_key: string;
  type: string;
  cue: string;
  answer: string;
  example: string | null;
  priority: "high" | "medium" | "low";
  occurrences: number;
  attempts: number;
  correct: number;
  next_due: string;
  learned_on: string;
  last_shown: string | null;
  status: string;
  review_stage: number;
  correct_streak: number;
  last_result: SelfGradeResult | null;
  last_answered_at: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function shanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function addDaysToIsoDate(date: string, days: number) {
  if (!isIsoDate(date) || !Number.isInteger(days)) {
    throw new Error("addDaysToIsoDate requires an ISO date and an integer day count.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

export function isPendingAnswer(item: Pick<LearningItemRecord, "last_shown" | "last_answered_at">) {
  if (!item.last_shown) return false;
  const lastAnsweredDate = item.last_answered_at
    ? shanghaiDate(new Date(item.last_answered_at))
    : null;
  return !lastAnsweredDate || lastAnsweredDate < item.last_shown;
}

export function parseSelfGradeRequest(value: unknown): SelfGradeRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isUuid(input.reviewItemId) || !isUuid(input.requestId)) return null;
  if (typeof input.result !== "string" || !SELF_GRADE_RESULTS.includes(input.result as SelfGradeResult)) return null;
  if (input.submittedText !== undefined && typeof input.submittedText !== "string") return null;
  const submittedText = input.submittedText ?? "";
  if (typeof submittedText !== "string" || submittedText.length > 10_000) return null;
  return {
    reviewItemId: input.reviewItemId,
    requestId: input.requestId,
    result: input.result as SelfGradeResult,
    submittedText,
  };
}

export function toScheduleItem(item: LearningItemRecord, today: string) {
  const pendingAnswer = isPendingAnswer(item);
  const isDue = item.next_due <= today;
  const shownToday = item.last_shown === today;
  const shownOnOrAfterToday = item.last_shown !== null && item.last_shown >= today;
  const selectable = isDue && !shownOnOrAfterToday;
  return {
    id: item.id,
    normalizedKey: item.normalized_key,
    type: item.type,
    cue: item.cue,
    answer: item.answer,
    example: item.example,
    priority: item.priority,
    occurrences: item.occurrences,
    attempts: item.attempts,
    correct: item.correct,
    nextDue: item.next_due,
    learnedOn: item.learned_on,
    lastShown: item.last_shown,
    status: item.status,
    reviewStage: item.review_stage,
    correctStreak: item.correct_streak,
    lastResult: item.last_result,
    lastAnsweredAt: item.last_answered_at,
    pendingAnswer,
    isNew: item.attempts === 0 && item.last_shown === null,
    isDue,
    shownToday,
    selectable,
    dueReason: selectable ? (pendingAnswer ? "pending_answer" : "scheduled") : null,
    deferredReason: isDue && shownOnOrAfterToday
      ? (shownToday ? "shown_today" : "shown_in_future")
      : null,
  };
}
