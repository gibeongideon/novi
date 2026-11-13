import { cn } from "@novi/ui";
import type { ReactNode } from "react";

/** Page frame for the screens shown without a session: sign-in, sign-up, password reset. */
export function PublicPage({ children }: { children: ReactNode }) {
  return <main className="novi-backdrop grid min-h-screen place-items-center bg-bg p-4">{children}</main>;
}

/** The card those screens sit in (`md` for longer forms). */
export const publicCard = (size: "sm" | "md" = "sm") =>
  cn(
    "grid w-full gap-4 rounded-xl border border-border bg-surface p-6 shadow-md",
    size === "sm" ? "max-w-sm" : "max-w-md",
  );
