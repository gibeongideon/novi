import { useMenus } from "@novi/engine";
import { Skeleton, useT } from "@novi/ui";
import { Link } from "react-router-dom";

import { AppIcon } from "./AppIcon";

/** Home screen: one tile per installed Odoo app (P1.11.1). */
export function AppLauncher() {
  const t = useT();
  const menus = useMenus();
  return (
    <section aria-label={t("apps")} className="mx-auto max-w-5xl p-6">
      <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        {menus.isPending
          ? Array.from({ length: 12 }, (_, i) => (
              <li key={i} className="grid justify-items-center gap-2">
                <Skeleton className="size-16" />
                <Skeleton className="h-4 w-16" />
              </li>
            ))
          : menus.data?.apps.map((app) => (
              <li key={app.id}>
                <Link
                  to={`/apps/${app.id}`}
                  className="grid justify-items-center gap-2 rounded-lg p-2 text-center text-sm hover:bg-surface-sunken"
                >
                  <AppIcon app={app} className="size-16 text-2xl" />
                  <span className="line-clamp-2">{app.name}</span>
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}
