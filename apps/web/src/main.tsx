import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

/** Skeleton until the shell lands (P1.11). Shows that the local stack is wired end to end. */
function App() {
  const [odoo, setOdoo] = useState<string>("checking…");
  useEffect(() => {
    fetch("/web/version")
      .then((r) => r.json() as Promise<{ version: string }>)
      .then((v) => setOdoo(`connected · Odoo ${v.version}`))
      .catch(() => setOdoo("not reachable: run pnpm odoo:up"));
  }, []);
  return (
    <main>
      <h1>NOVI</h1>
      <p>Odoo: {odoo}</p>
      <p>The app shell arrives in Phase 1 (P1.11). Progress: http://localhost:4321</p>
    </main>
  );
}

const el = document.getElementById("root");
if (!el) throw new Error("#root missing");
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
