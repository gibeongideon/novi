import type { ActionDescriptor } from "@novi/engine";
import { toast, useT } from "@novi/ui";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Carries out what an action resolved to (P2.8): open a screen or a record, a link or a report,
 * show a notification, or refresh the current screen. Errors go to the error dialog.
 * Dialogs (wizards, `target: "new"`) arrive with the form view (P2.10).
 */
export function useActionRunner(refresh: () => unknown) {
  const navigate = useNavigate();
  const t = useT();
  const [error, setError] = useState<unknown>(null);

  const run = useCallback(
    async (d: ActionDescriptor): Promise<void> => {
      switch (d.kind) {
        case "window":
          if (d.action.resId) navigate(`/record/${d.action.model}/${d.action.resId}`);
          else if (d.action.target === "new") toast.info(t("dialogSoon"));
          else if (d.action.id) navigate(`/action/${d.action.id}`);
          return;
        case "url":
          window.open(d.url, d.target === "self" ? "_self" : "_blank", "noopener");
          return;
        case "report":
          window.open(d.url, "_blank", "noopener");
          return;
        case "client": {
          const id = d.fallbackUrl?.match(/action-(\d+)/)?.[1];
          if (id) navigate(`/action/${id}`);
          return;
        }
        case "notification": {
          const show =
            d.type === "danger"
              ? toast.error
              : d.type === "warning"
                ? toast.warning
                : d.type === "success"
                  ? toast.success
                  : toast.info;
          show(d.message, { description: d.title });
          if (d.next) await run(d.next);
          return;
        }
        default:
          await refresh();
      }
    },
    [navigate, refresh, t],
  );

  /** Runs an async step that yields an action; any error opens the error dialog. */
  const guard = useCallback(
    async (step: () => Promise<ActionDescriptor | void>) => {
      try {
        const d = await step();
        if (d) await run(d);
      } catch (e) {
        setError(e);
      }
    },
    [run],
  );

  return { run, guard, error, clearError: () => setError(null) };
}
