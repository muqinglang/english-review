import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "@/lib/integration-secrets";

export const ELEVENLABS_PROVIDER = "elevenlabs";
export const DEFAULT_ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";

export type ElevenLabsMetadata = {
  voiceId: string;
  modelId: string;
};

export type ElevenLabsStatus = {
  configured: boolean;
  keySuffix: string | null;
  metadata: ElevenLabsMetadata;
};

type CredentialRow = {
  encrypted_secret: string;
  key_suffix: string;
  metadata: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeElevenLabsMetadata(
  value: unknown,
): ElevenLabsMetadata {
  const metadata = isRecord(value) ? value : {};
  const voiceId =
    typeof metadata.voiceId === "string" && metadata.voiceId.trim()
      ? metadata.voiceId.trim()
      : DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId =
    typeof metadata.modelId === "string" && metadata.modelId.trim()
      ? metadata.modelId.trim()
      : DEFAULT_ELEVENLABS_MODEL_ID;

  if (!/^[A-Za-z0-9_-]{1,100}$/.test(voiceId)) {
    throw new Error("Invalid ElevenLabs voice ID.");
  }
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(modelId)) {
    throw new Error("Invalid ElevenLabs model ID.");
  }

  return { voiceId, modelId };
}

function emptyStatus(metadata?: unknown): ElevenLabsStatus {
  return {
    configured: false,
    keySuffix: null,
    metadata: normalizeElevenLabsMetadata(metadata),
  };
}

export async function getElevenLabsStatus(
  userId: string,
): Promise<ElevenLabsStatus> {
  const { data, error } = await createAdminClient()
    .from("integration_credentials")
    .select("key_suffix,metadata")
    .eq("user_id", userId)
    .eq("provider", ELEVENLABS_PROVIDER)
    .maybeSingle();

  if (error) throw new Error("Unable to load ElevenLabs configuration.");
  if (!data) return emptyStatus();

  return {
    configured: true,
    keySuffix: data.key_suffix,
    metadata: normalizeElevenLabsMetadata(data.metadata),
  };
}

export async function saveElevenLabsConfiguration(
  userId: string,
  apiKey: string | undefined,
  metadataInput: unknown,
): Promise<ElevenLabsStatus> {
  const admin = createAdminClient();
  const metadata = normalizeElevenLabsMetadata(metadataInput);
  const { data: existing, error: existingError } = await admin
    .from("integration_credentials")
    .select("encrypted_secret,key_suffix,metadata")
    .eq("user_id", userId)
    .eq("provider", ELEVENLABS_PROVIDER)
    .maybeSingle<CredentialRow>();

  if (existingError) throw new Error("Unable to load ElevenLabs configuration.");

  const newKey = apiKey?.trim();
  if (newKey && (newKey.length < 8 || newKey.length > 512)) {
    throw new Error("Invalid ElevenLabs API key.");
  }
  if (!newKey && !existing) {
    throw new Error("An ElevenLabs API key is required.");
  }

  const encryptedSecret = newKey
    ? encryptIntegrationSecret(newKey, userId, ELEVENLABS_PROVIDER)
    : existing!.encrypted_secret;
  const keySuffix = newKey ? newKey.slice(-4) : existing!.key_suffix;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
  });
  if (profileError) throw new Error("Unable to initialize the user profile.");

  const { error } = await admin.from("integration_credentials").upsert(
    {
      user_id: userId,
      provider: ELEVENLABS_PROVIDER,
      encrypted_secret: encryptedSecret,
      key_suffix: keySuffix,
      metadata,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) throw new Error("Unable to save ElevenLabs configuration.");

  return { configured: true, keySuffix, metadata };
}

export async function deleteElevenLabsConfiguration(
  userId: string,
): Promise<ElevenLabsStatus> {
  const { error } = await createAdminClient()
    .from("integration_credentials")
    .delete()
    .eq("user_id", userId)
    .eq("provider", ELEVENLABS_PROVIDER);

  if (error) throw new Error("Unable to disconnect ElevenLabs.");
  return emptyStatus();
}

export async function getElevenLabsCredential(
  userId: string,
): Promise<{ apiKey: string; metadata: ElevenLabsMetadata } | null> {
  const { data, error } = await createAdminClient()
    .from("integration_credentials")
    .select("encrypted_secret,key_suffix,metadata")
    .eq("user_id", userId)
    .eq("provider", ELEVENLABS_PROVIDER)
    .maybeSingle<CredentialRow>();

  if (error) throw new Error("Unable to load ElevenLabs configuration.");
  if (!data) return null;

  return {
    apiKey: decryptIntegrationSecret(
      data.encrypted_secret,
      userId,
      ELEVENLABS_PROVIDER,
    ),
    metadata: normalizeElevenLabsMetadata(data.metadata),
  };
}
