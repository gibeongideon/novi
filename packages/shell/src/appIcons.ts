/**
 * NOVI's own app identity (D-23): icon, tile colour, group and one-line description per app.
 * Single source, keyed by the Odoo module that owns the app's root menu (from its xmlid) so any
 * installed app resolves without per-tenant config. Unknown apps get a generic entry.
 * Texts are i18n keys (NOVI-owned strings); app *names* still come from Odoo.
 */
import type { MenuNode } from "@novi/engine";
import type { MessageKey } from "@novi/ui";
import {
  AppWindow,
  Blocks,
  Boxes,
  CalendarDays,
  Clock,
  Contact,
  FileStack,
  Handshake,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
  Receipt,
  ScanBarcode,
  Settings,
  ShoppingBag,
  ShoppingCart,
  TreePalm,
  Users,
  Wallet,
} from "lucide-react";

export type AppGroup = "sell" | "finance" | "operations" | "people" | "workspace" | "admin" | "other";
export const GROUP_ORDER: AppGroup[] = [
  "sell",
  "finance",
  "operations",
  "people",
  "workspace",
  "admin",
  "other",
];

/** Tile colour = index into the token app palette (1–8). */
export type Tone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface AppIdentity {
  icon: LucideIcon;
  tone: Tone;
  group: AppGroup;
  description?: MessageKey;
}

const BY_MODULE: Record<string, AppIdentity> = {
  crm: { icon: Handshake, tone: 3, group: "sell", description: "app.crm" },
  sale: { icon: ShoppingBag, tone: 1, group: "sell", description: "app.sale" },
  contacts: { icon: Contact, tone: 8, group: "sell", description: "app.contacts" },
  account: { icon: Receipt, tone: 6, group: "finance", description: "app.account" },
  account_accountant: { icon: Receipt, tone: 6, group: "finance", description: "app.account" },
  purchase: { icon: ShoppingCart, tone: 4, group: "operations", description: "app.purchase" },
  stock: { icon: Boxes, tone: 7, group: "operations", description: "app.stock" },
  stock_barcode: { icon: ScanBarcode, tone: 2, group: "operations", description: "app.stock_barcode" },
  hr: { icon: Users, tone: 1, group: "people", description: "app.hr" },
  hr_attendance: { icon: Clock, tone: 8, group: "people", description: "app.hr_attendance" },
  hr_holidays: { icon: TreePalm, tone: 6, group: "people", description: "app.hr_holidays" },
  hr_expense: { icon: Wallet, tone: 5, group: "people", description: "app.hr_expense" },
  mail: { icon: MessagesSquare, tone: 7, group: "workspace", description: "app.mail" },
  calendar: { icon: CalendarDays, tone: 3, group: "workspace", description: "app.calendar" },
  documents: { icon: FileStack, tone: 5, group: "workspace", description: "app.documents" },
  spreadsheet_dashboard: {
    icon: LayoutDashboard,
    tone: 2,
    group: "workspace",
    description: "app.spreadsheet_dashboard",
  },
};

/** Root menus owned by `base` are told apart by their xmlid. */
const BY_XMLID: Record<string, AppIdentity> = {
  "base.menu_management": { icon: Blocks, tone: 2, group: "admin", description: "app.apps" },
  "base.menu_administration": { icon: Settings, tone: 7, group: "admin", description: "app.settings" },
};

export function appIdentity(app: MenuNode): AppIdentity {
  const module = app.xmlid.split(".")[0] ?? "";
  const known = BY_XMLID[app.xmlid] ?? BY_MODULE[module];
  if (known) return known;
  // unknown app: generic icon, stable colour from its xmlid
  let h = 0;
  for (const c of app.xmlid || app.name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { icon: AppWindow, tone: ((h % 8) + 1) as Tone, group: "other" };
}
