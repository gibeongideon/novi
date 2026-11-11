import { firstActionMenu, type MenuNode } from "@novi/engine";

/** The one place that turns a menu into a URL (launcher tiles, breadcrumbs, app redirect). */
export function menuUrl(menu: MenuNode): string | undefined {
  const target = firstActionMenu(menu);
  return target?.action ? `/action/${target.action.id}?menu=${target.id}` : undefined;
}
