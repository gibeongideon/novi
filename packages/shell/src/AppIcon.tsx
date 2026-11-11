import type { MenuNode } from "@novi/engine";
import { cn } from "@novi/ui";

import { appIcon, appTone } from "./appIcons";

/** NOVI app icon: a token-coloured glyph on a neutral chip (D-23: not Odoo's icon artwork). */
export function AppIcon({
  app,
  size = "md",
  className,
}: {
  app: MenuNode;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = appIcon(app);
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-border bg-surface-sunken",
        size === "sm" ? "size-7 [&_svg]:size-4" : "size-11 [&_svg]:size-5",
        appTone(app),
        className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}
