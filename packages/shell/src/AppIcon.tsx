import type { MenuNode } from "@novi/engine";
import { cn } from "@novi/ui";

/** Odoo app icon (embedded data URL from load_menus) with an initial-letter fallback. */
export function AppIcon({ app, className }: { app: MenuNode; className?: string }) {
  return app.icon ? (
    <img src={app.icon} alt="" className={cn("rounded-md object-contain", className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        "grid place-items-center rounded-md bg-surface-sunken font-semibold text-text-muted",
        className,
      )}
    >
      {app.name.slice(0, 1)}
    </span>
  );
}
