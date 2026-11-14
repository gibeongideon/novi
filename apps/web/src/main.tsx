import "@novi/ui/styles.css";

import { EngineProvider, gatewayAuth } from "@novi/engine";
import { JsonRpcTransport } from "@novi/odoo-client";
import { ShellRoutes } from "@novi/shell";
import { ThemeProvider, Toaster, TooltipProvider } from "@novi/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

/**
 * Same-domain mode (D-03): Odoo is served from this origin (Vite proxy in dev, reverse proxy in
 * production), so the browser keeps Odoo's own session cookie. The gateway mode swaps this transport.
 */
const transport = new JsonRpcTransport({ baseUrl: window.location.origin });
const db = import.meta.env.VITE_ODOO_DB ?? "novi_demo";

// a data router: the form view can hold navigation while it saves (useBlocker, P2.10.6)
const router = createBrowserRouter([{ path: "*", element: <ShellRoutes /> }]);

const el = document.getElementById("root");
if (!el) throw new Error("#root missing");
createRoot(el).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <EngineProvider transport={transport} db={db} auth={gatewayAuth()}>
          <RouterProvider router={router} />
        </EngineProvider>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
