import "@novi/ui/styles.css";

import { Badge, Button, ThemeProvider, Toaster, TooltipProvider } from "@novi/ui";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

/** Skeleton until the shell lands (P1.11). Shows the local stack is wired end to end. */
function App() {
  const [odoo, setOdoo] = useState<{ ok: boolean; text: string }>({ ok: false, text: "checking…" });
  useEffect(() => {
    fetch("/web/version")
      .then((r) => r.json() as Promise<{ version: string }>)
      .then((v) => setOdoo({ ok: true, text: `Odoo ${v.version}` }))
      .catch(() => setOdoo({ ok: false, text: "Odoo not reachable: run pnpm odoo:up" }));
  }, []);
  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">NOVI</h1>
        <Badge tone={odoo.ok ? "success" : "warning"}>{odoo.text}</Badge>
      </header>
      <p className="text-text-muted">
        The app shell arrives in P1.11. Components: Storybook at http://localhost:6006 · progress at
        http://localhost:4321
      </p>
      <div className="flex gap-2">
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
    </main>
  );
}

const el = document.getElementById("root");
if (!el) throw new Error("#root missing");
createRoot(el).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
