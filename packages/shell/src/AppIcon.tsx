import type { MenuNode } from "@novi/engine";
import { cn } from "@novi/ui";

import { appIdentity } from "./appIcons";

const sizes = {
  sm: "size-7 rounded-lg [&_svg]:size-4",
  md: "size-12 rounded-xl [&_svg]:size-6",
  lg: "size-14 rounded-2xl [&_svg]:size-7",
  xl: "size-16 rounded-[22px] [&_svg]:size-8",
} as const;

/** NOVI app tile: the app's colour on a simple line icon over a white tile (D-23: not Odoo's artwork). */
export function AppIcon({
  app,
  size = "md",
  className,
}: {
  app: MenuNode;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const { icon: Icon, tone } = appIdentity(app);
  return (
    <span
      aria-hidden
      data-tone={tone}
      className={cn("novi-tile grid shrink-0 place-items-center", sizes[size], className)}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}
