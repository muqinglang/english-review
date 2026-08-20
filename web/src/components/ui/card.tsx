import type { ReactNode } from "react";

// Standard surface panel. Presentational only.
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-card border border-line bg-surface p-6 ${className}`}>{children}</section>;
}
