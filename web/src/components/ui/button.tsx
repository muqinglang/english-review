import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

// Shared button so every action reads the same. Presentational only (no hooks),
// so it works inside both server and client components.
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children: ReactNode }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-control font-bold transition active:translate-y-px disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  const sizes: Record<Size, string> = {
    md: "px-5 py-3 text-sm",
    sm: "px-3 py-2 text-xs",
  };
  const variants: Record<Variant, string> = {
    primary: "bg-ink text-white hover:bg-[#2e403c]",
    secondary: "border border-line bg-surface text-primary hover:bg-mint",
    ghost: "text-primary hover:bg-mint",
    danger: "border border-[#e6c3ba] text-danger hover:bg-[#fbeeea]",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
