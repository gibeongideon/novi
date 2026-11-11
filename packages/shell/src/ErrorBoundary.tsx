import { Button, useT } from "@novi/ui";
import { RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches crashes while rendering a screen (P1.12.5), so one broken screen never blanks the app.
 * `resetKey` (e.g. the URL) clears the error when the user navigates elsewhere.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[novi] screen crashed", error, info.componentStack);
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  override render() {
    return this.state.error ? <CrashPanel error={this.state.error} /> : this.props.children;
  }
}

function CrashPanel({ error }: { error: Error }) {
  const t = useT();
  return (
    <div role="alert" className="mx-auto grid max-w-lg gap-3 p-8">
      <h1 className="text-xl font-semibold">{t("errorTitle")}</h1>
      <p className="text-text-muted">{t("errorBody")}</p>
      <div>
        <Button variant="primary" onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden />
          {t("reload")}
        </Button>
      </div>
      <details className="text-sm text-text-muted">
        <summary>{t("technicalDetails")}</summary>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-md bg-surface-sunken p-3 font-mono text-xs">
          {error.message}
        </pre>
      </details>
    </div>
  );
}
