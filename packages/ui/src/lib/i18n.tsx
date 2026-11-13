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
  switchToDark: "Switch to dark mode",
  company: "Company",
  switchCompany: "Switch company",
  errorTitle: "Something went wrong",
  errorBody:
    "This screen hit an unexpected problem. Reload to continue. If it keeps happening, contact support.",
  reload: "Reload",
  technicalDetails: "Technical details",
  switchToLight: "Switch to light mode",
  login: "Email or login",
  password: "Password",
  apps: "Apps",
  searchEverything: "Search apps, menus and records…",
  searching: "Searching…",
  menus: "Menus",
  "group.sell": "Sell",
  "group.finance": "Finance",
  "group.operations": "Operations",
  "group.people": "People",
  "group.workspace": "Workspace",
  "group.admin": "Administration",
  "group.other": "More apps",
  "app.mail": "Chat, channels and messages",
  "app.calendar": "Meetings and events",
  "app.contacts": "Customers, vendors and people",
  "app.crm": "Pipeline, leads and opportunities",
  "app.sale": "Quotations and sales orders",
  "app.spreadsheet_dashboard": "Live business dashboards",
  "app.account": "Invoices, bills and payments",
  "app.accountant": "Accounting, invoices and reporting",
  "app.documents": "Files and document workflows",
  "app.purchase": "Requests for quotation and orders",
  "app.stock": "Stock, transfers and warehouses",
  "app.stock_barcode": "Scan and process operations",
  "app.hr": "Your team directory",
  "app.hr_attendance": "Check-ins and working hours",
  "app.hr_holidays": "Leave requests and allocations",
  "app.hr_expense": "Expense claims and reports",
  "app.apps": "Install and manage apps",
  "app.project": "Projects, tasks and planning",
  "app.project_todo": "Your personal to-dos",
  "app.databases": "Manage your databases",
  "app.settings": "Company, users and configuration",
  menu: "Menu",
  openInOdoo: "Open in Odoo",
  nativeViewSoon: "NOVI will render this screen natively in Phase 2. Until then you can open it in Odoo.",
  wrongCredentials: "Wrong email or password.",
  twoFactorCode: "Authentication code",
  twoFactorHelp: "Open your authenticator app and enter the 6-digit code.",
  rememberDevice: "Don't ask again on this device",
  verify: "Verify",
  wrongCode: "That code didn't work. Use the latest code from your app.",
  signInExpired: "Your sign-in timed out. Please enter your password again.",
  twoFactorUnsupported: "This account uses two-factor sign-in, which needs the NOVI gateway.",
  signInFailed: "Sign-in failed. Please try again.",
  back: "Back",
  createWorkspace: "Create your workspace",
  newHere: "New here?",
  haveAccount: "Already have a workspace? Sign in",
  companyName: "Company name",
  workEmail: "Work email",
  choosePassword: "Choose a password (at least 10 characters)",
  country: "Country",
  workspaceAddress: "Workspace address",
  addressTaken: "This address is taken.",
  addressInvalid: "Use lowercase letters and digits, starting with a letter.",
  getStarted: "Create workspace",
  invalidCompany: "Enter your company name.",
  invalidEmail: "Enter a valid email address.",
  invalidPassword: "Use at least 10 characters.",
  invalidCountry: "Choose a country.",
  tooManySignups: "Too many attempts. Please try again later.",
  checkEmailTitle: "Check your email",
  checkEmailBody: "We sent a confirmation link. Open it to create your workspace.",
  invalidLink: "That confirmation link is no longer valid. Please sign up again.",
  settingUp: "Setting up your workspace",
  settingUpBody: "This takes about a minute. You can keep this page open.",
  "step.waiting": "Waiting to start",
  "step.database": "Creating your database",
  "step.files": "Preparing file storage",
  "step.apps": "Installing your apps",
  "step.start": "Starting your workspace",
  "step.account": "Setting up your account",
  "step.address": "Connecting your address",
  workspaceReady: "Your workspace is ready",
  workspaceReadyBody: "Sign in with your email and the password you chose.",
  openWorkspace: "Open workspace",
  setupFailed: "Something went wrong while setting up your workspace. Our team has been notified.",
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
