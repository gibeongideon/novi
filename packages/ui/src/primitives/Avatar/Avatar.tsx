import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "../../lib/cn";

export interface AvatarProps {
  /** Image URL, e.g. Odoo /web/image/res.users/<id>/avatar_128. */
  src?: string;
  /** Person or company name; used for alt text and initials fallback. */
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "size-6 text-xs", md: "size-8 text-sm", lg: "size-12 text-base" } as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn("inline-flex shrink-0 overflow-hidden rounded-full", sizes[size], className)}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center bg-surface-sunken font-medium text-text-muted"
        aria-label={name}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
