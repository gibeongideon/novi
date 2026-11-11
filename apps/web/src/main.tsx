import "@novi/ui/styles.css";

import { EngineProvider, gatewayAuth } from "@novi/engine";
import { JsonRpcTransport } from "@novi/odoo-client";
import { ShellRoutes } from "@novi/shell";
import { ThemeProvider, Toaster, TooltipProvider } from "@novi/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

/**
 * Same-domain mode (D-03): Odoo is served from this origin (Vite proxy in dev, reverse proxy in
 * production), so the browser keeps Odoo's own session cookie. The gateway mode swaps this transport.
 */
const transport = new JsonRpcTransport({ baseUrl: window.location.origin });
const db = import.meta.env.VITE_ODOO_DB ?? "novi_demo";

const el = document.getElementById("root");
if (!el) throw new Error("#root missing");
createRoot(el).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <EngineProvider transport={transport} db={db} auth={gatewayAuth()}>
          <BrowserRouter>
            <ShellRoutes />
          </BrowserRouter>
        </EngineProvider>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
