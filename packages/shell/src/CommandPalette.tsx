import { type MenuNode, menuPath, useMenus, useRecordSearch } from "@novi/engine";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  useT,
} from "@novi/ui";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { AppIcon } from "./AppIcon";
import { menuUrl } from "./urls";
import { useDebounced } from "./useDebounced";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  query: string;
  onQueryChange(query: string): void;
}

/**
 * Global search (P1.13, D-24): opened by typing anywhere, ⌘K/Ctrl+K, or the top-bar search button.
 * Searches apps and every menu by its full path ("Sales Orders Customers"). Records come in P1.13.2.
 */
export function CommandPalette({ open, onOpenChange, query, onQueryChange }: CommandPaletteProps) {
  const t = useT();
  const navigate = useNavigate();
  const menus = useMenus();
  const records = useRecordSearch(useDebounced(query));

  const entries = useMemo(() => {
    if (!menus.data) return { apps: [], items: [] as { node: MenuNode; path: string[] }[] };
    const items: { node: MenuNode; path: string[] }[] = [];
    for (const node of menus.data.byId.values()) {
      if (node.action && !node.children.length && node.parentId) {
        items.push({ node, path: menuPath(menus.data, node.id).map((n) => n.name) });
      }
    }
    return { apps: menus.data.apps, items };
  }, [menus.data]);

  const go = (node: MenuNode) => {
    const url = menuUrl(node);
    if (url) navigate(url);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} filter={wordFilter}>
      <CommandInput placeholder={t("searchEverything")} value={query} onValueChange={onQueryChange} />
      <CommandList>
        {/* local "no results" only counts locally-filtered items, so hide it when Odoo found records */}
        {records.data?.length || records.isFetching ? null : <CommandEmpty />}
        <CommandGroup heading={t("apps")}>
          {entries.apps.map((app) => (
            <CommandItem
              key={`app-${app.id}`}
              value={`${app.name}${ID_SEP}app-${app.id}`}
              onSelect={() => go(app)}
            >
              <AppIcon app={app} size="sm" />
              {app.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t("menus")}>
          {entries.items.map(({ node, path }) => (
            <CommandItem
              key={`menu-${node.id}`}
              value={`${path.join(" ")}${ID_SEP}menu-${node.id}`}
              onSelect={() => go(node)}
            >
              <span className="truncate">
                <span className="text-text-muted">{path.slice(0, -1).join(" / ")} / </span>
                {path.at(-1)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        {records.data?.map((g) => (
          <CommandGroup key={g.model} heading={g.label} forceMount>
            {g.hits.map((h) => (
              // Odoo already matched these (name, email, reference…): don't re-filter them locally
              <CommandItem
                key={`${h.model}-${h.id}`}
                forceMount
                value={`${h.name}${ID_SEP}rec-${h.model}-${h.id}`}
                onSelect={() => {
                  navigate(`/record/${h.model}/${h.id}`);
                  onOpenChange(false);
                }}
              >
                {h.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {records.isFetching ? <p className="px-3 py-2 text-sm text-text-muted">{t("searching")}</p> : null}
      </CommandList>
    </CommandDialog>
  );
}

/** Separates the searchable text from the unique id suffix in item values. */
const ID_SEP = "\u0000";

/**
 * Every typed word must appear in the item text (case-insensitive); apps rank above menus via
 * group order, shorter paths first. Replaces cmdk's fuzzy matching, which was too noisy.
 */
export function wordFilter(value: string, search: string): number {
  const text = (value.split(ID_SEP)[0] ?? "").toLowerCase();
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.every((w) => text.includes(w))) return 0;
  const startsWord = words.every((w) => text.startsWith(w) || text.includes(` ${w}`));
  return (startsWord ? 2 : 1) - text.length / 1000;
}
