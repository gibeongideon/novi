import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

/** Loading placeholder shaped like the final layout (UI-RULES §5: no spinners over empty pages). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("rounded-md bg-surface-sunken motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
