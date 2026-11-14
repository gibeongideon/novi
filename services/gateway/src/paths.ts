/**
 * Who answers a path on a tenant's host (D-40). One source for the gateway and Vite's dev proxy.
 * NOVI owns its app's routes and the gateway's endpoints; every other path belongs to the tenant's
 * own Odoo (its apps add route families like /discuss, /calendar, /spreadsheet, and customers'
 * email links use /my, /payment…), except the few Odoo paths that are never exposed.
 * No dependencies: imported by vite.config.ts too.
 */

/** Client-side routes and files of the NOVI web app (served as the app shell / static files). */
export const APP_PATHS = [
  "/apps",
  "/action",
  "/record",
  "/signup",
  "/reset-password",
  "/assets",
  "/favicon.svg",
  "/robots.txt",
  "/index.html",
];

/** The gateway's own endpoints. */
export const GATEWAY_PATHS = ["/api", "/healthz", "/readyz"];

/** Odoo paths never exposed: the database manager and the deprecated RPC endpoints (D-07, D-11). */
export const BLOCKED_PATHS = ["/web/database", "/jsonrpc", "/xmlrpc"];

const pathOf = (url: string) => url.split("?")[0]!;
const under = (url: string, prefix: string) => {
  const path = pathOf(url);
  return path === prefix || path.startsWith(`${prefix}/`);
};

/** The app's own route or file ("/" included). */
export const isAppPath = (url: string) => pathOf(url) === "/" || APP_PATHS.some((p) => under(url, p));
export const isNoviPath = (url: string) => isAppPath(url) || GATEWAY_PATHS.some((p) => under(url, p));
export const isBlocked = (url: string) => BLOCKED_PATHS.some((p) => under(url, p));
/** Forwarded to the tenant's Odoo. */
export const isProxied = (url: string) => !isNoviPath(url) && !isBlocked(url);
