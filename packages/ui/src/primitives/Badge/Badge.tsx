import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

/** Status always carries text, never colour alone (UI-RULES §4). */
export const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-px text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-sunken text-text",
        info: "border-info text-info",
        success: "border-success text-success",
        warning: "border-warning text-warning",
        danger: "border-danger text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
