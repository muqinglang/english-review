import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "@/lib/integration-secrets";

export const ELEVENLABS_PROVIDER = "elevenlabs";
export const DEFAULT_ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";
export const MAX_ELEVENLABS_VOICES = 10;

// A brand-new ElevenLabs setup ships with both a British and an American stock
// voice so the per-play voice picker is useful immediately. The first entry is
// the default. These are long-standing ElevenLabs premade voice IDs.
export const DEFAULT_ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George · British" },
  { voiceId: "21m00Tcm4TlvDq8ikWAM", name: "Rachel · American" },
];

const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export type ElevenLabsVoice = {
  voiceId: string;
  name: string;
};

export type ElevenLabsMetadata = {
  // voiceId is the default voice (always voices[0]); kept for backward
  // compatibility with callers and older single-voice metadata rows.
  voiceId: string;
  modelId: string;
  voices: ElevenLabsVoice[];
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

function normalizeVoice(value: unknown, index: number): ElevenLabsVoice {
  const record = isRecord(value) ? value : {};
  const voiceId =
    typeof record.voiceId === "string" && record.voiceId.trim()
      ? record.voiceId.trim()
      : "";
  if (!VOICE_ID_PATTERN.test(voiceId)) {
    throw new Error("Invalid ElevenLabs voice ID.");
  }
  const rawName = typeof record.name === "string" ? record.name.trim() : "";
  const name = (rawName || `Voice ${index + 1}`).slice(0, 40);
  return { voiceId, name };
}

export function normalizeElevenLabsMetadata(
  value: unknown,
): ElevenLabsMetadata {
  const metadata = isRecord(value) ? value : {};
  const modelId =
    typeof metadata.modelId === "string" && metadata.modelId.trim()
      ? metadata.modelId.trim()
      : DEFAULT_ELEVENLABS_MODEL_ID;
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(modelId)) {
    throw new Error("Invalid ElevenLabs model ID.");
  }

  // New multi-voice shape ({ voices: [...] }) is preferred; fall back to the
  // legacy single voiceId so older rows and callers keep working.
  const rawVoices = Array.isArray(metadata.voices) ? metadata.voices : null;
  let voices: ElevenLabsVoice[];
  if (rawVoices && rawVoices.length) {
    voices = rawVoices.slice(0, MAX_ELEVENLABS_VOICES).map(normalizeVoice);
  } else if (typeof metadata.voiceId === "string" && metadata.voiceId.trim()) {
    // Legacy single-voice rows keep their saved voice untouched.
    voices = [normalizeVoice({ voiceId: metadata.voiceId.trim(), name: "Default voice" }, 0)];
  } else {
    // Nothing configured yet: seed the British + American default pair.
    voices = DEFAULT_ELEVENLABS_VOICES.map(normalizeVoice);
  }

  // Drop duplicate voice IDs while preserving order and the caller's chosen
  // default (the first entry).
  const seen = new Set<string>();
  voices = voices.filter((voice) => {
    if (seen.has(voice.voiceId)) return false;
    seen.add(voice.voiceId);
    return true;
  });

  return { voiceId: voices[0].voiceId, modelId, voices };
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

export async function synthesizeElevenLabsAudio(
  credential: { apiKey: string; metadata: ElevenLabsMetadata },
  text: string,
  voiceIdOverride?: string,
) {
  // Only allow overriding with a voice the user actually saved, so a request
  // cannot drive synthesis with an arbitrary voice under their key.
  const voiceId =
    voiceIdOverride &&
    credential.metadata.voices.some((voice) => voice.voiceId === voiceIdOverride)
      ? voiceIdOverride
      : credential.metadata.voiceId;
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        accept: "audio/mpeg",
        "content-type": "application/json",
        "xi-api-key": credential.apiKey,
      },
      body: JSON.stringify({ text, model_id: credential.metadata.modelId }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    },
  );
}
