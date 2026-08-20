import Link from "next/link";
import type { ReactNode } from "react";
import { CaretLeft, SquaresFour } from "@phosphor-icons/react/dist/ssr";

// One page chrome for every screen: unified canvas background, container width,
// and a top bar with the "Chat Review" brand on the left and a page-specific
// actions slot on the right. Keeping this in one place is what stops the
// per-page nav/background drift.
export function AppShell({
  children,
  width = "wide",
  right,
}: {
  children: ReactNode;
  width?: "wide" | "narrow";
  right?: ReactNode;
}) {
  return (
    <main className="min-h-[100dvh] bg-canvas px-4 py-4 text-ink sm:px-8 sm:py-6">
      <div className={`mx-auto ${width === "narrow" ? "max-w-4xl" : "max-w-6xl"}`}>
        <nav className="flex items-center justify-between gap-3 border-b border-line pb-4">
          <Link href="/review" className="flex items-center gap-2 text-sm font-black tracking-tight">
            <span className="grid size-8 place-items-center rounded-control bg-ink text-white">
              <SquaresFour size={17} weight="fill" />
            </span>
            Chat Review
          </Link>
          {right ? <div className="flex items-center gap-2">{right}</div> : null}
        </nav>
        {children}
      </div>
    </main>
  );
}

export function AccountChip({ label, email }: { label: string; email?: string | null }) {
  return (
    <span
      className="hidden max-w-28 truncate text-xs font-bold text-primary sm:inline"
      title={email ?? undefined}
    >
      {label}
    </span>
  );
}

// Square icon-only nav link. `primary` = filled dark, `ghost` = bordered.
export function NavIconLink({
  href,
  label,
  variant = "ghost",
  children,
}: {
  href: string;
  label: string;
  variant?: "primary" | "ghost";
  children: ReactNode;
}) {
  const styles =
    variant === "primary"
      ? "bg-ink text-white hover:bg-[#2e403c]"
      : "border border-line bg-surface text-[#41514b] hover:border-[#8eaa9a]";
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center rounded-control transition active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${styles}`}
    >
      {children}
    </Link>
  );
}

export function BackToReviewLink() {
  return (
    <Link
      href="/review"
      className="inline-flex items-center gap-1 rounded-control px-3 py-2 text-sm font-bold text-primary transition hover:bg-surface"
    >
      <CaretLeft size={15} weight="bold" />
      Back to review
    </Link>
  );
}
