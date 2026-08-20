import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/integration-secrets";

export const DEEPSEEK_PROVIDER = "deepseek";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

export type DeepSeekMetadata = { modelId: string };
export type DeepSeekStatus = { configured: boolean; keySuffix: string | null; metadata: DeepSeekMetadata };

type CredentialRow = { encrypted_secret: string; key_suffix: string; metadata: unknown };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeDeepSeekMetadata(value: unknown): DeepSeekMetadata {
  const metadata = record(value);
  const modelId = typeof metadata.modelId === "string" && metadata.modelId.trim() ? metadata.modelId.trim() : DEFAULT_DEEPSEEK_MODEL;
  if (!/^[a-zA-Z0-9_.:-]{1,100}$/.test(modelId)) throw new Error("Invalid DeepSeek configuration.");
  return { modelId };
}

export async function getDeepSeekCredential(userId: string): Promise<{ apiKey: string; metadata: DeepSeekMetadata } | null> {
  const { data, error } = await createAdminClient().from("integration_credentials").select("encrypted_secret,key_suffix,metadata").eq("user_id", userId).eq("provider", DEEPSEEK_PROVIDER).maybeSingle<CredentialRow>();
  if (error) throw new Error("Unable to load DeepSeek configuration.");
  if (!data) return null;
  return { apiKey: decryptIntegrationSecret(data.encrypted_secret, userId, DEEPSEEK_PROVIDER), metadata: normalizeDeepSeekMetadata(data.metadata) };
}

export async function getDeepSeekStatus(userId: string): Promise<DeepSeekStatus> {
  const { data, error } = await createAdminClient().from("integration_credentials").select("key_suffix,metadata").eq("user_id", userId).eq("provider", DEEPSEEK_PROVIDER).maybeSingle();
  if (error) throw new Error("Unable to load DeepSeek configuration.");
  return data ? { configured: true, keySuffix: data.key_suffix, metadata: normalizeDeepSeekMetadata(data.metadata) } : { configured: false, keySuffix: null, metadata: normalizeDeepSeekMetadata({}) };
}

export async function saveDeepSeekConfiguration(userId: string, apiKey: string | undefined, metadataInput: unknown): Promise<DeepSeekStatus> {
  const admin = createAdminClient();
  const metadata = normalizeDeepSeekMetadata(metadataInput);
  const { data: existing, error: existingError } = await admin.from("integration_credentials").select("encrypted_secret,key_suffix").eq("user_id", userId).eq("provider", DEEPSEEK_PROVIDER).maybeSingle<CredentialRow>();
  if (existingError) throw new Error("Unable to load DeepSeek configuration.");
  const key = apiKey?.trim();
  if (key && (key.length < 8 || key.length > 512)) throw new Error("Invalid DeepSeek API key.");
  if (!key && !existing) throw new Error("A DeepSeek API key is required.");
  await admin.from("profiles").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
  const { error } = await admin.from("integration_credentials").upsert({ user_id: userId, provider: DEEPSEEK_PROVIDER, encrypted_secret: key ? encryptIntegrationSecret(key, userId, DEEPSEEK_PROVIDER) : existing!.encrypted_secret, key_suffix: key ? key.slice(-4) : existing!.key_suffix, metadata, updated_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
  if (error) throw new Error("Unable to save DeepSeek configuration.");
  return { configured: true, keySuffix: key ? key.slice(-4) : existing!.key_suffix, metadata };
}

export async function deleteDeepSeekConfiguration(userId: string): Promise<DeepSeekStatus> {
  const { error } = await createAdminClient().from("integration_credentials").delete().eq("user_id", userId).eq("provider", DEEPSEEK_PROVIDER);
  if (error) throw new Error("Unable to disconnect DeepSeek.");
  return { configured: false, keySuffix: null, metadata: normalizeDeepSeekMetadata({}) };
}

// Weave the learner's due review words into one short, natural story for a
// listening/dictation exercise. Kept short so the downstream TTS endpoint (which
// caps free text) can voice the whole thing in a single clip.
export async function generateListeningStory(
  credential: { apiKey: string; metadata: DeepSeekMetadata },
  words: string[],
): Promise<string> {
  const targets = words.map((word) => word.trim()).filter(Boolean).slice(0, 20);
  if (!targets.length) throw new Error("No review words to build a story from.");

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${credential.apiKey}`,
    },
    body: JSON.stringify({
      model: credential.metadata.modelId,
      messages: [
        {
          role: "system",
          content:
            "You are an English tutor writing short listening-practice stories for an intermediate (B1-B2) learner. Write ONE natural, coherent story of 60-90 words that uses every target word or phrase at least once, in clear everyday English suitable for a dictation exercise. Return only the story text: no title, no word list, no markdown, no quotation marks, no explanations.",
        },
        {
          role: "user",
          content: `Target words/phrases to include: ${targets.join(", ")}`,
        },
      ],
      temperature: 0.8,
      max_tokens: 400,
      stream: false,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) throw new Error("DeepSeek request failed.");
  const data = await response.json().catch(() => null) as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = data?.choices?.[0]?.message?.content;
  const story = typeof content === "string" ? content.trim() : "";
  if (!story) throw new Error("DeepSeek returned an empty story.");
  return story;
}
