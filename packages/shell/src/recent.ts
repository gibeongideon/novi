/**
 * Recently opened records (P2.10.11), for the search palette. Kept in this browser only: a
 * convenience, like Odoo's own (it's per device there too). Never required for anything to work.
 */
export interface RecentItem {
  url: string;
  label: string;
}

const KEY = "novi.recent";
const MAX = 8;

export function readRecent(): RecentItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as RecentItem[]).filter((r) => r && r.url && r.label) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(item: RecentItem): void {
  try {
    const rest = readRecent().filter((r) => r.url !== item.url);
    localStorage.setItem(KEY, JSON.stringify([item, ...rest].slice(0, MAX)));
  } catch {
    // storage blocked: nothing to remember
  }
}
