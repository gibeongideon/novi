import { type MenuNode, useMenus } from "@novi/engine";
import { Skeleton, useT } from "@novi/ui";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { AppIcon } from "./AppIcon";
import { type AppGroup, appIdentity, GROUP_ORDER } from "./appIcons";

/**
 * Home (P1.11.1, D-23): apps grouped by purpose as cards with gradient tiles and a one-line
 * description. Deliberately clean: no hero or search box; search is type-anywhere (D-24).
 */
export function AppLauncher() {
  const t = useT();
  const menus = useMenus();

  const groups = useMemo(() => {
    const apps = menus.data?.apps ?? [];
    const byGroup = new Map<AppGroup, MenuNode[]>();
    for (const app of apps) {
      const g = appIdentity(app).group;
      byGroup.set(g, [...(byGroup.get(g) ?? []), app]);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, apps: byGroup.get(g)! }));
  }, [menus.data]);

  return (
    <div className="min-h-full">
      <div className="mx-auto grid max-w-content gap-8 px-6 py-10">
        {menus.isPending ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-20 rounded-xl" />
              </li>
            ))}
          </ul>
        ) : (
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
        )}
      </div>
    </div>
  );
}
