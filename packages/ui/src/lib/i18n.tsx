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
