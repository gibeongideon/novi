import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Local Odoo (pnpm odoo:up) is served through the Vite dev server on the same origin, the same
 * "same-domain" mode NOVI uses in production (D-03), so Odoo's session cookie just works.
 */
const ODOO = process.env.ODOO_URL ?? "http://127.0.0.1:18069";
const ODOO_WS = process.env.ODOO_WS_URL ?? "ws://127.0.0.1:18072";
const toOdoo = { target: ODOO, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  resolve: {
    // use workspace sources directly so edits in packages hot-reload without a rebuild
    alias: {
      "@novi/ui/styles.css": fileURLToPath(new URL("../../packages/ui/src/styles.css", import.meta.url)),
      "@novi/ui": fileURLToPath(new URL("../../packages/ui/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/web": toOdoo,
      "/json": toOdoo,
      "/mail": toOdoo,
      "/report": toOdoo,
      "/odoo": toOdoo,
      "/websocket": { target: ODOO_WS, ws: true, changeOrigin: true },
    },
  },
});
