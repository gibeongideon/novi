/**
 * NOVI's own app icons (D-23: NOVI does not reuse Odoo's look or design assets).
 * Single source: one map keyed by the Odoo module that owns the app's root menu (from its xmlid),
 * so any installed app resolves without per-tenant config; unknown apps get a generic icon.
 */
import type { MenuNode } from "@novi/engine";
import {
  AppWindow,
  Blocks,
  Boxes,
  CalendarDays,
  Clock,
  Contact,
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

const BY_MODULE: Record<string, LucideIcon> = {
  mail: MessagesSquare,
  calendar: CalendarDays,
  contacts: Contact,
  crm: Handshake,
  sale: ShoppingBag,
  purchase: ShoppingCart,
  spreadsheet_dashboard: LayoutDashboard,
  account: Receipt,
  account_accountant: Receipt,
  stock: Boxes,
  stock_barcode: ScanBarcode,
  hr: Users,
  hr_attendance: Clock,
  hr_holidays: TreePalm,
  hr_expense: Wallet,
};

/** Root menus that belong to `base` are told apart by their xmlid. */
const BY_XMLID: Record<string, LucideIcon> = {
  "base.menu_management": Blocks,
  "base.menu_administration": Settings,
};

/** Token tones for icon chips (no raw colours: UI-RULES §1). */
const TONES = ["text-primary", "text-accent", "text-success", "text-warning", "text-info"] as const;

export function appIcon(app: MenuNode): LucideIcon {
  const module = app.xmlid.split(".")[0] ?? "";
  return BY_XMLID[app.xmlid] ?? BY_MODULE[module] ?? AppWindow;
}

/** Stable tone per app (same app, same colour, for every user and tenant). */
export function appTone(app: MenuNode): (typeof TONES)[number] {
  let h = 0;
  for (const c of app.xmlid || app.name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}
