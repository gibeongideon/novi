import { type MenuNode, useMenus, useSession } from "@novi/engine";
import { Input, Skeleton, useT } from "@novi/ui";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppIcon } from "./AppIcon";
import { type AppGroup, appIdentity, GROUP_ORDER } from "./appIcons";

/**
 * Home (P1.11.1, D-23): greeting over a brand wash, app search, and apps grouped by purpose as
 * cards with gradient tiles and a one-line description. Names come from Odoo; the look is NOVI's.
 */
export function AppLauncher() {
  const t = useT();
  const menus = useMenus();
  const { info } = useSession();
  const [query, setQuery] = useState("");
  const firstName = String(info?.name ?? "").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "goodMorning" : hour < 18 ? "goodAfternoon" : "goodEvening");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const apps = (menus.data?.apps ?? []).filter((a) => !q || a.name.toLowerCase().includes(q));
    const byGroup = new Map<AppGroup, MenuNode[]>();
    for (const app of apps) {
      const g = appIdentity(app).group;
      byGroup.set(g, [...(byGroup.get(g) ?? []), app]);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, apps: byGroup.get(g)! }));
  }, [menus.data, query]);

  return (
    <div className="min-h-full">
      <section className="novi-hero border-b border-border">
        <div className="mx-auto grid max-w-content gap-5 px-6 pb-8 pt-10">
          <div className="grid gap-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-lg text-text-muted">{t("pickApp")}</p>
          </div>
          <label className="relative block max-w-md">
            <span className="sr-only">{t("searchApps")}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              type="search"
              placeholder={t("searchApps")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 rounded-xl bg-surface pl-9 shadow-sm"
            />
          </label>
        </div>
      </section>

      <div className="mx-auto grid max-w-content gap-8 px-6 py-8">
        {menus.isPending ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-20 rounded-xl" />
              </li>
            ))}
          </ul>
        ) : groups.length ? (
          groups.map(({ group, apps }) => (
            <section key={group} aria-labelledby={`apps-${group}`} className="grid gap-3">
              <h2
                id={`apps-${group}`}
                className="text-sm font-semibold uppercase tracking-wider text-text-muted"
              >
                {t(`group.${group}`)}
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {apps.map((app) => {
                  const desc = appIdentity(app).description;
                  return (
                    <li key={app.id}>
                      <Link
                        to={`/apps/${app.id}`}
                        aria-labelledby={`app-${app.id}`}
                        aria-describedby={desc ? `app-${app.id}-desc` : undefined}
                        className="group flex h-full items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:-translate-y-px hover:border-primary hover:shadow-md motion-reduce:transform-none"
                      >
                        <AppIcon
                          app={app}
                          size="lg"
                          className="transition-transform group-hover:scale-105 motion-reduce:transform-none"
                        />
                        <span className="grid min-w-0 gap-0.5">
                          <span id={`app-${app.id}`} className="truncate text-base font-semibold">
                            {app.name}
                          </span>
                          {desc ? (
                            <span id={`app-${app.id}-desc`} className="line-clamp-2 text-sm text-text-muted">
                              {t(desc)}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        ) : (
          <p className="text-text-muted">{t("noAppsFound")}</p>
        )}
      </div>
    </div>
  );
}
