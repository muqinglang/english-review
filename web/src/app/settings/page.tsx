import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogoutButton } from "@/components/logout-button";
import { WorkerTokenPanel, type WorkerDevice } from "@/components/worker-token-panel";
import { FishAudioPanel } from "@/components/fish-audio-panel";
import { getFishAudioStatus, type FishAudioStatus } from "@/lib/fish-audio";
import { ElevenLabsPanel } from "@/components/elevenlabs-panel";
import { getElevenLabsStatus, type ElevenLabsStatus } from "@/lib/elevenlabs";
import { VoiceProviderPreference } from "@/components/voice-provider-preference";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { data } = await createAdminClient()
    .from("worker_devices")
    .select("id,display_name,created_at,last_seen_at,revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const devices: WorkerDevice[] = (data ?? []).map((device) => ({
    id: device.id,
    displayName: device.display_name,
    createdAt: device.created_at,
    lastSeenAt: device.last_seen_at,
    revokedAt: device.revoked_at,
  }));

  let fishAudioStatus: FishAudioStatus = {
    configured: false,
    keySuffix: null,
    metadata: { referenceId: null, modelId: "s2-pro" },
  };
  let elevenLabsStatus: ElevenLabsStatus = {
    configured: false,
    keySuffix: null,
    metadata: {
      voiceId: "JBFqnCBsd6RMkjVDRZzb",
      modelId: "eleven_flash_v2_5",
      voices: [{ voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "Default voice" }],
    },
  };
  try {
    [fishAudioStatus, elevenLabsStatus] = await Promise.all([
      getFishAudioStatus(user.id),
      getElevenLabsStatus(user.id),
    ]);
  } catch {
    // Keep the rest of Settings available while a migration is being applied.
  }

  return (
    <main className="min-h-screen bg-[#f4f6f3] px-4 py-5 text-[#172223] sm:px-10 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <nav className="flex items-center justify-between">
          <Link href="/review" className="font-black">Chat Review</Link>
          <Link href="/review" className="rounded-lg px-3 py-2 text-sm font-bold text-[#4e8a70] hover:bg-white">Back to review</Link>
        </nav>
        <header className="mt-12">
          <p className="text-sm font-extrabold tracking-[0.16em] text-[#4e8a70]">SETTINGS</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">Settings</h1>
          <p className="mt-4 text-[#596861]">Manage your account, local sync devices, and voice services.</p>
        </header>
        <section className="mt-8 rounded-2xl border border-[#dce4dc] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold tracking-[0.12em] text-[#6d7a74]">Account</p>
              <p className="mt-2 font-extrabold">{user.email ?? "Signed-in user"}</p>
              <p className="mt-1 text-sm text-[#76837c]">Securely authenticated via Supabase</p>
            </div>
            <LogoutButton />
          </div>
        </section>
        <div className="mt-6"><VoiceProviderPreference fishConfigured={fishAudioStatus.configured} elevenLabsConfigured={elevenLabsStatus.configured} /></div>
        <div className="mt-6"><FishAudioPanel initialStatus={fishAudioStatus} /></div>
        <div className="mt-6"><ElevenLabsPanel initialStatus={elevenLabsStatus} /></div>
        <div className="mt-6"><WorkerTokenPanel devices={devices} /></div>
      </div>
    </main>
  );
}
