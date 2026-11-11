import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>NOVI</h1>
      <p>Skeleton. The shell arrives in Phase 1 (see ROADMAP.md).</p>
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
