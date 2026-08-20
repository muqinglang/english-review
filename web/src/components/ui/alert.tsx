import type { ReactNode } from "react";

type Tone = "success" | "error" | "warning" | "info";

// Inline status / error message box with consistent tones.
export function Alert({
  tone = "info",
  role,
  className = "",
  children,
}: {
  tone?: Tone;
  role?: "status" | "alert";
  className?: string;
  children: ReactNode;
}) {
  const tones: Record<Tone, string> = {
    success: "bg-mint text-primary-strong",
    error: "bg-[#fbeeea] text-danger",
    warning: "bg-[#fffaf0] text-[#80631c]",
    info: "bg-mint text-primary-strong",
  };
  const resolvedRole = role ?? (tone === "error" ? "alert" : "status");
  return (
    <p role={resolvedRole} className={`rounded-card px-4 py-3 text-sm leading-6 ${tones[tone]} ${className}`}>
      {children}
    </p>
  );
}
