import type { ReactNode } from "react";

type Tone = "success" | "neutral";

// Small status pill (e.g. "Credentials saved" / "Not configured").
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    success: "bg-mint text-primary",
    neutral: "bg-[#eeeeea] text-faint",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${tones[tone]}`}>{children}</span>;
}
