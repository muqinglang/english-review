import { currentUser } from "@/lib/auth";
import { getFishAudioCredential, synthesizeFishAudio } from "@/lib/fish-audio";

function upstreamMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : "Fish Audio 未能生成测试语音。";
  } catch {
    return "Fish Audio 未能生成测试语音。";
  }
}

export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ message: "请先登录。" }, { status: 401 });

  try {
    const credential = await getFishAudioCredential(user.id);
    if (!credential) return Response.json({ message: "请先连接 Fish Audio。" }, { status: 409 });
    const upstream = await synthesizeFishAudio(credential, "Hello! This is a Fish Audio connection test for your English review.");
    if (!upstream.ok || !upstream.body) {
      const message = upstream.status === 429
        ? "Fish Audio 额度不足或请求过于频繁。"
        : upstreamMessage(await upstream.text().catch(() => ""));
      return Response.json({ message }, { status: upstream.status >= 400 ? upstream.status : 502 });
    }
    return new Response(upstream.body, {
      headers: { "content-type": "audio/mpeg", "cache-control": "private, no-store, max-age=0" },
    });
  } catch {
    return Response.json({ message: "无法连接 Fish Audio，请稍后再试。" }, { status: 502 });
  }
}
