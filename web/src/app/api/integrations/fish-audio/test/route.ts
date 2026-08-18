import { currentUser } from "@/lib/auth";
import { getFishAudioCredential, synthesizeFishAudio } from "@/lib/fish-audio";

function upstreamMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : "Fish Audio could not generate the test audio.";
  } catch {
    return "Fish Audio could not generate the test audio.";
  }
}

export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Please sign in first." }, { status: 401 });

  try {
    const credential = await getFishAudioCredential(user.id);
    if (!credential) return Response.json({ message: "Please connect Fish Audio first." }, { status: 409 });
    const upstream = await synthesizeFishAudio(credential, "Hello! This is a Fish Audio connection test for your English review.");
    if (!upstream.ok || !upstream.body) {
      const message = upstream.status === 429
        ? "Fish Audio quota is insufficient or requests are too frequent."
        : upstreamMessage(await upstream.text().catch(() => ""));
      return Response.json({ message }, { status: upstream.status >= 400 ? upstream.status : 502 });
    }
    return new Response(upstream.body, {
      headers: { "content-type": "audio/mpeg", "cache-control": "private, no-store, max-age=0" },
    });
  } catch {
    return Response.json({ message: "Unable to connect to Fish Audio. Please try again later." }, { status: 502 });
  }
}
