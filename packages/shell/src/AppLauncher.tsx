import { type MenuNode, useMenus } from "@novi/engine";
import { Skeleton, Tooltip, useT } from "@novi/ui";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { AppIcon } from "./AppIcon";
import { type AppGroup, appIdentity, GROUP_ORDER } from "./appIcons";

/**
 * Home (P1.11.1, D-23/D-24): icon-first gradient tiles in grouped "islands" that flow side by side,
 * centred, so every app fits on one screen. Descriptions live in a tooltip (and for screen
 * readers), not on the page. App names come from Odoo; the look is NOVI's own.
 */
export function AppLauncher() {
  const t = useT();
  const menus = useMenus();

  const groups = useMemo(() => {
    const byGroup = new Map<AppGroup, MenuNode[]>();
    for (const app of menus.data?.apps ?? []) {
      const g = appIdentity(app).group;
      byGroup.set(g, [...(byGroup.get(g) ?? []), app]);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, apps: byGroup.get(g)! }));
  }, [menus.data]);

  return (
    <div className="novi-backdrop min-h-full">
      <div className="mx-auto flex max-w-content flex-wrap items-start justify-center gap-x-14 gap-y-10 px-6 py-12 md:py-16">
        {menus.isPending
          ? Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="grid gap-3">
                <Skeleton className="h-3 w-20" />
                <div className="flex gap-2">
                  {Array.from({ length: 3 }, (__, j) => (
                    <Skeleton key={j} className="size-16 rounded-[22px]" />
                  ))}
                </div>
              </div>
            ))
          : groups.map(({ group, apps }) => (
              <section key={group} aria-labelledby={`apps-${group}`} className="grid gap-3">
                <h2
                  id={`apps-${group}`}
                  className="px-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted"
                >
                  {t(`group.${group}`)}
                </h2>
                <ul className="flex flex-wrap gap-1">
                  {apps.map((app) => {
                    const desc = appIdentity(app).description;
                    const tile = (
                      <Link
                        to={`/apps/${app.id}`}
                        aria-describedby={desc ? `app-${app.id}-desc` : undefined}
                        className="group grid w-24 justify-items-center gap-2 rounded-2xl px-1 py-2 text-center outline-offset-4"
                      >
                        <AppIcon
                          app={app}
                          size="xl"
                          className="transition duration-fast group-hover:-translate-y-0.5 group-active:scale-95 motion-reduce:transform-none"
                        />
                        <span className="line-clamp-2 text-sm font-medium leading-tight">{app.name}</span>
                      </Link>
                    );
                    return (
                      <li key={app.id}>
                        {desc ? (
                          <Tooltip content={t(desc)} side="bottom">
                            {tile}
                          </Tooltip>
                        ) : (
                          tile
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
      </div>
    </div>
  );
}
