import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/integration-secrets";

export const FISH_AUDIO_PROVIDER = "fish_audio";
export const DEFAULT_FISH_AUDIO_MODEL = "s2-pro";

export type FishAudioMetadata = { referenceId: string | null; modelId: string };
export type FishAudioStatus = { configured: boolean; keySuffix: string | null; metadata: FishAudioMetadata };

type CredentialRow = { encrypted_secret: string; key_suffix: string; metadata: unknown };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeFishAudioMetadata(value: unknown): FishAudioMetadata {
  const metadata = record(value);
  const referenceId = typeof metadata.referenceId === "string" && metadata.referenceId.trim() ? metadata.referenceId.trim() : null;
  const modelId = typeof metadata.modelId === "string" && metadata.modelId.trim() ? metadata.modelId.trim() : DEFAULT_FISH_AUDIO_MODEL;
  if ((referenceId && !/^[a-zA-Z0-9_-]{1,160}$/.test(referenceId)) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(modelId)) throw new Error("Invalid Fish Audio configuration.");
  return { referenceId, modelId };
}

export async function getFishAudioCredential(userId: string): Promise<{ apiKey: string; metadata: FishAudioMetadata } | null> {
  const { data, error } = await createAdminClient().from("integration_credentials").select("encrypted_secret,key_suffix,metadata").eq("user_id", userId).eq("provider", FISH_AUDIO_PROVIDER).maybeSingle<CredentialRow>();
  if (error) throw new Error("Unable to load Fish Audio configuration.");
  if (!data) return null;
  return { apiKey: decryptIntegrationSecret(data.encrypted_secret, userId, FISH_AUDIO_PROVIDER), metadata: normalizeFishAudioMetadata(data.metadata) };
}

export async function synthesizeFishAudio(
  credential: { apiKey: string; metadata: FishAudioMetadata },
  text: string,
) {
  return fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      accept: "audio/mpeg",
      "content-type": "application/json",
      authorization: `Bearer ${credential.apiKey}`,
      model: credential.metadata.modelId,
    },
    body: JSON.stringify({
      text,
      format: "mp3",
      ...(credential.metadata.referenceId ? { reference_id: credential.metadata.referenceId } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
}

export async function getFishAudioStatus(userId: string): Promise<FishAudioStatus> {
  const { data, error } = await createAdminClient().from("integration_credentials").select("key_suffix,metadata").eq("user_id", userId).eq("provider", FISH_AUDIO_PROVIDER).maybeSingle();
  if (error) throw new Error("Unable to load Fish Audio configuration.");
  return data ? { configured: true, keySuffix: data.key_suffix, metadata: normalizeFishAudioMetadata(data.metadata) } : { configured: false, keySuffix: null, metadata: normalizeFishAudioMetadata({}) };
}

export async function saveFishAudioConfiguration(userId: string, apiKey: string | undefined, metadataInput: unknown): Promise<FishAudioStatus> {
  const admin = createAdminClient();
  const metadata = normalizeFishAudioMetadata(metadataInput);
  const { data: existing, error: existingError } = await admin.from("integration_credentials").select("encrypted_secret,key_suffix").eq("user_id", userId).eq("provider", FISH_AUDIO_PROVIDER).maybeSingle<CredentialRow>();
  if (existingError) throw new Error("Unable to load Fish Audio configuration.");
  const key = apiKey?.trim();
  if (key && (key.length < 8 || key.length > 512)) throw new Error("Invalid Fish Audio API key.");
  if (!key && !existing) throw new Error("A Fish Audio API key is required.");
  await admin.from("profiles").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
  const { error } = await admin.from("integration_credentials").upsert({ user_id: userId, provider: FISH_AUDIO_PROVIDER, encrypted_secret: key ? encryptIntegrationSecret(key, userId, FISH_AUDIO_PROVIDER) : existing!.encrypted_secret, key_suffix: key ? key.slice(-4) : existing!.key_suffix, metadata, updated_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
  if (error) throw new Error("Unable to save Fish Audio configuration.");
  return { configured: true, keySuffix: key ? key.slice(-4) : existing!.key_suffix, metadata };
}

export async function deleteFishAudioConfiguration(userId: string): Promise<FishAudioStatus> {
  const { error } = await createAdminClient().from("integration_credentials").delete().eq("user_id", userId).eq("provider", FISH_AUDIO_PROVIDER);
  if (error) throw new Error("Unable to disconnect Fish Audio.");
  return { configured: false, keySuffix: null, metadata: normalizeFishAudioMetadata({}) };
}
