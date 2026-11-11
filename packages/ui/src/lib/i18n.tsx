/**
 * NOVI's own UI strings (P1.10.6). Odoo-provided text (field labels, help, selections) never comes
 * from here: it comes from Odoo metadata (UI-RULES §1). Only strings NOVI itself owns live here.
 * Translations beyond English are added per language as the catalogue grows.
 */
import { createContext, type ReactNode, useContext, useMemo } from "react";

export const en = {
  close: "Close",
  cancel: "Cancel",
  confirm: "Confirm",
  loading: "Loading…",
  search: "Search",
  noResults: "No results found.",
  breadcrumb: "Breadcrumb",
  moreActions: "More actions",
  signIn: "Sign in",
  signOut: "Sign out",
  login: "Email or login",
  password: "Password",
  apps: "Apps",
  menu: "Menu",
  openInOdoo: "Open in Odoo",
  nativeViewSoon: "NOVI will render this screen natively in Phase 2. Until then you can open it in Odoo.",
  twoFactorNotYet:
    "Two-factor sign-in arrives with the gateway (P1.6). Use Odoo's own login for this account for now.",
  noAction: "This menu has no screen of its own.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

const I18nContext = createContext<Messages>(en);

/** Provide messages for the user's language (falls back to English per key). */
export function I18nProvider({ messages, children }: { messages?: Partial<Messages>; children: ReactNode }) {
  const value = useMemo(() => ({ ...en, ...messages }), [messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): (key: MessageKey) => string {
  const messages = useContext(I18nContext);
  return (key) => messages[key];
}
