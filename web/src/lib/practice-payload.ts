import { isIsoDate } from "@/lib/srs";

// Shared validation for a ChatGPT "english-review-sync" practice batch. Used by
// both the Worker push endpoint and the in-page paste importer so the accepted
// format (rich example object, single-knowledge-point keys, length limits) stays
// identical everywhere.

export const ITEM_TYPES = ["fact", "concept", "decision", "quote", "vocabulary", "expression", "grammar", "error", "pronunciation"] as const;
export const PRIORITIES = ["high", "medium", "low"] as const;

export type ItemType = (typeof ITEM_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type ValidatedItem = {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function nonEmptyString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

export function normalizeExample(value: unknown): string | null {
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

export function validateItems(value: unknown): ValidatedItem[] | null {
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

/**
 * A practice item must stay a single self-gradable knowledge point. Only the
 * normalizedKey (the identity) is guarded — cue/answer prose may legitimately
 * contain a slash (e.g. the Chinese gloss "积分/额度").
 */
export function hasMergedKnowledgePoint(items: ValidatedItem[]): boolean {
  return items.some((item) => /[;；/、]/.test(item.normalizedKey));
}
