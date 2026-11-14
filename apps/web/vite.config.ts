import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

import { APP_PATHS } from "../../services/gateway/src/paths";

/**
 * Everything Odoo-related goes through the NOVI gateway, in dev exactly as in production (D-27):
 * the gateway resolves the tenant (localhost → the local demo Odoo), signs in (incl. 2FA) and
 * reverse-proxies Odoo routes and the websocket. Host is kept so tenant lookup and Odoo's
 * websocket Origin check work.
 */
const GATEWAY = process.env.GATEWAY_URL ?? "http://127.0.0.1:4000";
const toGateway = { target: GATEWAY, changeOrigin: false };
// Vite serves its own files and the app's routes (one list with the gateway: paths.ts, D-40);
// everything else (Odoo's routes, the gateway's /api) goes to the gateway. Websocket first.
const escape = (p: string) => p.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const VITE_OWN = ["@", "src/", "node_modules/"];
const notApp = `^/(?!(?:${[...VITE_OWN, ...APP_PATHS.map((p) => `${escape(p)}(?:/|\\?|$)`), "\\?", "$"].join("|")})).*`;
const proxy: Record<string, ProxyOptions> = {
  "/websocket": { target: GATEWAY.replace(/^http/, "ws"), ws: true, changeOrigin: false },
  [notApp]: toGateway,
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    // use workspace sources directly so edits in packages hot-reload without a rebuild
    alias: {
      "@novi/ui/styles.css": fileURLToPath(new URL("../../packages/ui/src/styles.css", import.meta.url)),
      "@novi/ui": fileURLToPath(new URL("../../packages/ui/src/index.ts", import.meta.url)),
      "@novi/engine": fileURLToPath(new URL("../../packages/engine/src/index.ts", import.meta.url)),
      "@novi/shell": fileURLToPath(new URL("../../packages/shell/src/index.ts", import.meta.url)),
      "@novi/odoo-client": fileURLToPath(new URL("../../packages/odoo-client/src/index.ts", import.meta.url)),
    },
  },
  // production build served locally (pnpm --filter @novi/web preview) with the same Odoo proxy
  preview: { port: 4173, strictPort: true, proxy },
  server: {
    port: 5173,
    strictPort: true,
    proxy,
  },
});
