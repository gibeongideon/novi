/**
 * The search bar (P2.12, L4) for any Odoo search view: facets for what is active (filters,
 * searched values, group-bys, a favourite), typing suggests "search <field> for …" and, for
 * relations, matching records; one menu holds the filters (with date periods), group-bys
 * (the view's and any groupable field) and favourites. Controlled: the state lives in the URL.
 */
import {
  canGroupBy,
  type Favorite,
  filterKey,
  PERIODS,
  type SearchFieldValue,
  type SearchState,
  useFormat,
  useNameSearch,
} from "@novi/engine";
import type { FieldMeta } from "@novi/odoo-meta";
import type { SearchSchema } from "@novi/odoo-meta";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useT,
} from "@novi/ui";
import { ChevronRight, Filter, Layers, Search, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

export interface SearchBarProps {
  search: SearchSchema;
  state: SearchState;
  onChange(state: SearchState): void;
  /** All fields of the model (custom group-by: any groupable field). */
  fields: Record<string, FieldMeta>;
  favorites: readonly Favorite[];
  onSaveFavorite(): void;
  onDeleteFavorite(id: number): void;
}

export function SearchBar({
  search,
  state,
  onChange,
  fields,
  favorites,
  onSaveFavorite,
  onDeleteFavorite,
}: SearchBarProps) {
  const t = useT();
  const fmt = useFormat();
  const listId = useId();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const locale = fmt.settings.lang.code.replace("_", "-");
  const label = (name: string) => fields[name]?.string ?? search.fields[name]?.string ?? name;

  const toggle = <T,>(list: readonly T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  const set = (patch: Partial<SearchState>) => onChange({ ...state, ...patch });

  // ── suggestions while typing: one per search field, matching records under a relation ──
  const searchFields = search.searchFields.filter((f) => f.invisible !== true);
  const relation = expanded ? (fields[expanded]?.relation as string | undefined) : undefined;
  const matches = useNameSearch(relation, text, [], !!relation && !!text, 5);
  type Suggestion = { key: string; node: ReactNode; pick(): void; sub?: boolean; expand?: string };
  const suggestions: Suggestion[] = text.trim()
    ? searchFields.flatMap((f): Suggestion[] => {
        const isRelation = fields[f.name]?.type === "many2one" || fields[f.name]?.type === "many2many";
        const add = (v: SearchFieldValue) => {
          set({ fields: [...state.fields, v] });
          setText("");
          setExpanded(null);
        };
        const main: Suggestion = {
          key: f.name,
          expand: isRelation ? f.name : undefined,
          node: (
            <>
              {t("searchFieldFor", { field: f.string ?? label(f.name) })}{" "}
              <b className="font-medium">{text}</b>
            </>
          ),
          pick: () => add({ name: f.name, value: text.trim(), label: text.trim() }),
        };
        const subs =
          expanded === f.name
            ? (matches.data ?? []).map((r): Suggestion => ({
                key: `${f.name}-${r.id}`,
                sub: true,
                node: r.display_name,
                pick: () => add({ name: f.name, value: r.id, label: r.display_name }),
              }))
            : [];
        return [main, ...subs];
      })
    : [];

  // ── facets ──
  const facets: { key: string; icon: ReactNode; text: string; remove(): void }[] = [];
  search.filterGroups.forEach((group, gi) => {
    const on = group
      .map((f, fi) => ({ f, key: filterKey(f, gi, fi) }))
      .filter(({ key }) => state.filters.includes(key));
    if (!on.length) return;
    facets.push({
      key: `g${gi}`,
      icon: <Filter aria-hidden className="size-3.5" />,
      text: on
        .map(({ f, key }) =>
          f.date
            ? `${f.string}: ${(state.periods?.[key] ?? [f.defaultPeriod ?? "month"]).map(periodLabel).join(", ")}`
            : f.string,
        )
        .join(` ${t("or")} `),
      remove: () => set({ filters: state.filters.filter((k) => !on.some((o) => o.key === k)) }),
    });
  });
  for (const name of new Set(state.fields.map((v) => v.name))) {
    const values = state.fields.filter((v) => v.name === name);
    const f = search.searchFields.find((x) => x.name === name);
    facets.push({
      key: `f-${name}`,
      icon: <Search aria-hidden className="size-3.5" />,
      text: `${f?.string ?? label(name)}: ${values.map((v) => v.label).join(` ${t("or")} `)}`,
      remove: () => set({ fields: state.fields.filter((v) => v.name !== name) }),
    });
  }
  if (state.groupBy.length)
    facets.push({
      key: "groupby",
      icon: <Layers aria-hidden className="size-3.5" />,
      text: state.groupBy.map((g) => groupLabel(g)).join(" › "),
      remove: () => set({ groupBy: [] }),
    });
  const fav = favorites.find((f) => f.id === state.favorite);
  if (fav)
    facets.push({
      key: "fav",
      icon: <Star aria-hidden className="size-3.5" />,
      text: fav.name,
      remove: () => set({ favorite: undefined }),
    });

  function groupLabel(fieldName: string) {
    const known = search.groupBys.find((g) => g.fieldName === fieldName);
    if (known) return known.string;
    const [name, interval] = fieldName.split(":");
    return interval ? `${label(name!)}: ${interval}` : label(name!);
  }

  function periodLabel(p: string): string {
    const now = new Date();
    if (p.startsWith("month")) {
      const d = new Date(now.getFullYear(), now.getMonth() - Number(p.split("-")[1] ?? 0), 1);
      return d.toLocaleDateString(locale, { month: "long" });
    }
    if (p.startsWith("year")) return String(now.getFullYear() - Number(p.split("-")[1] ?? 0));
    return p.toUpperCase();
  }

  const customGroupable = Object.entries(fields)
    .filter(([name]) => name !== "id" && canGroupBy(name, fields))
    .filter(([name]) => !search.groupBys.some((g) => g.fieldName === name))
    .sort(([, a], [, b]) => String(a.string).localeCompare(String(b.string)));

  return (
    <div
      className="relative flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-1 rounded-md border border-border bg-surface px-2 py-1"
      role="search"
    >
      <Search aria-hidden className="size-4 text-text-muted" />
      {facets.map((f) => (
        <span
          key={f.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-xs"
        >
          {f.icon}
          <span className="truncate">{f.text}</span>
          <button
            type="button"
            aria-label={t("removeFacet", { name: f.text })}
            onClick={f.remove}
            className="text-text-muted hover:text-text"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}
      <input
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-label={t("search")}
        placeholder={facets.length ? "" : t("searchPlaceholder")}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, suggestions.length - 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
          else if (e.key === "ArrowRight" && suggestions[active]?.expand)
            setExpanded(suggestions[active]!.expand!);
          else if (e.key === "Enter" && suggestions[active]) suggestions[active]!.pick();
          else if (e.key === "Escape") setText("");
          else if (e.key === "Backspace" && !text && facets.length) facets.at(-1)!.remove();
          else return;
          e.preventDefault();
        }}
      />
      {suggestions.length ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-full max-w-md rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              role="option"
              aria-selected={i === active}
              className={cn(
                "flex cursor-pointer items-center gap-1 px-3 py-1.5 text-sm",
                s.sub && "ps-8",
                i === active && "bg-surface-sunken",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                s.pick();
              }}
              onMouseEnter={() => setActive(i)}
            >
              {s.expand ? (
                <button
                  type="button"
                  aria-label={t("showMatches")}
                  className="text-text-muted"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setExpanded(expanded === s.expand ? null : s.expand!);
                  }}
                >
                  <ChevronRight
                    aria-hidden
                    className={cn("size-3.5 transition-transform", expanded === s.expand && "rotate-90")}
                  />
                </button>
              ) : null}
              <span className="truncate">{s.node}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("searchOptions")}>
            <SlidersHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[70vh] w-72 overflow-y-auto">
          <DropdownMenuLabel>{t("filters")}</DropdownMenuLabel>
          {search.filterGroups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 ? <DropdownMenuSeparator /> : null}
              {group.map((f, fi) => {
                if (f.invisible === true) return null;
                const key = filterKey(f, gi, fi);
                const on = state.filters.includes(key);
                return (
                  <div key={key}>
                    <DropdownMenuCheckboxItem
                      checked={on}
                      onCheckedChange={() => set({ filters: toggle(state.filters, key) })}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {f.string}
                    </DropdownMenuCheckboxItem>
                    {f.date && on
                      ? PERIODS.map((p) => {
                          const chosen = state.periods?.[key] ?? [f.defaultPeriod ?? "month"];
                          return (
                            <DropdownMenuCheckboxItem
                              key={p}
                              className="ps-10 text-sm"
                              checked={chosen.includes(p)}
                              onCheckedChange={() => {
                                const next = toggle(chosen, p);
                                set({ periods: { ...state.periods, [key]: next.length ? next : chosen } });
                              }}
                              onSelect={(e) => e.preventDefault()}
                            >
                              {periodLabel(p)}
                            </DropdownMenuCheckboxItem>
                          );
                        })
                      : null}
                  </div>
                );
              })}
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("groupBy")}</DropdownMenuLabel>
          {search.groupBys
            .filter((g) => g.invisible !== true && canGroupBy(g.fieldName, fields))
            .map((g) => (
              <DropdownMenuCheckboxItem
                key={g.fieldName}
                checked={state.groupBy.includes(g.fieldName)}
                onCheckedChange={() => set({ groupBy: toggle(state.groupBy, g.fieldName) })}
                onSelect={(e) => e.preventDefault()}
              >
                {g.string}
              </DropdownMenuCheckboxItem>
            ))}
          <div className="px-2 py-1.5">
            <select
              aria-label={t("customGroupBy")}
              className="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value=""
              onChange={(e) => e.target.value && set({ groupBy: [...state.groupBy, e.target.value] })}
            >
              <option value="">{t("customGroupBy")}</option>
              {customGroupable.map(([name, f]) => (
                <option key={name} value={name}>
                  {f.string}
                </option>
              ))}
            </select>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("favorites")}</DropdownMenuLabel>
          {favorites.map((f) => (
            <div key={f.id} className="flex items-center">
              <DropdownMenuCheckboxItem
                className="flex-1"
                checked={state.favorite === f.id}
                onCheckedChange={(on) => set({ favorite: on ? f.id : undefined })}
                onSelect={(e) => e.preventDefault()}
              >
                {f.name}
              </DropdownMenuCheckboxItem>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("deleteFavorite", { name: f.name })}
                onClick={() => onDeleteFavorite(f.id)}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <DropdownMenuItem onSelect={onSaveFavorite}>{t("saveSearch")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
