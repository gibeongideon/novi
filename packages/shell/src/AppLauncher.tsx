import { useMenus, useSession } from "@novi/engine";
import { Skeleton, useT } from "@novi/ui";
import { Link } from "react-router-dom";

import { AppIcon } from "./AppIcon";

/**
 * Home: a greeting and app cards (P1.11.1). Deliberately not Odoo's centred icon grid (D-23):
 * left-aligned cards with NOVI icons, names from Odoo.
 */
export function AppLauncher() {
  const t = useT();
  const menus = useMenus();
  const { info } = useSession();
  const firstName = String(info?.name ?? "").split(" ")[0];
  return (
    <section aria-label={t("apps")} className="mx-auto grid max-w-content gap-6 p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">
          {t("welcome")}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-text-muted">{t("pickApp")}</p>
      </header>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {menus.isPending
          ? Array.from({ length: 8 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-16" />
              </li>
            ))
          : menus.data?.apps.map((app) => (
              <li key={app.id}>
                <Link
                  to={`/apps/${app.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm transition-colors hover:border-primary"
                >
                  <AppIcon app={app} />
                  <span className="truncate font-medium">{app.name}</span>
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}
