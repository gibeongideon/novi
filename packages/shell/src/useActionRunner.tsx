import { type ActionDescriptor, encodeStack, useActionManager, type WindowAction } from "@novi/engine";
import { toast } from "@novi/ui";
import { type ReactNode, useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ErrorDialog } from "./ErrorDialog";
import { FormDialog } from "./FormDialog";

/**
 * Carries out what an action resolved to (P2.8): open a screen or a record on top of the current
 * action stack (P2.10.12), a wizard in a dialog (`target: "new"`), a link or a report, show a
 * notification, or refresh the current screen. `ui` holds the dialogs (wizard, error): render it.
 */
export function useActionRunner(refresh: () => unknown): {
  run(d: ActionDescriptor): Promise<void>;
  guard(step: () => Promise<ActionDescriptor | void>): Promise<void>;
  ui: ReactNode;
} {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const am = useActionManager();
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<WindowAction | null>(null);
  // a new screen goes on top of the current action stack (breadcrumbs), else starts one
  const stack = pathname.startsWith("/action/") ? pathname : "";

  const run = useCallback(
    async (d: ActionDescriptor): Promise<void> => {
      switch (d.kind) {
        case "window": {
          const a = d.action;
          setDialog(a.target === "new" ? a : null);
          if (a.target === "new") return;
          if (a.id) navigate(`${stack}${encodeStack([{ action: a.id, resId: a.resId }])}${search}`);
          else if (a.resId) navigate(`/record/${a.model}/${a.resId}`);
          return;
        }
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
        case "reload":
          if (d.full) window.location.reload();
          else await refresh();
          return;
        case "close":
          setDialog(null);
          await refresh();
          return;
        default:
          await refresh();
      }
    },
    [navigate, refresh, stack, search],
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

  const ui = (
    <>
      {dialog ? (
        <FormDialog
          key={JSON.stringify([dialog.id, dialog.model, dialog.resId, dialog.context])}
          action={dialog}
          onClose={() => setDialog(null)}
          onButton={(record, button) => void guard(() => am.executeButton(record, button))}
        />
      ) : null}
      <ErrorDialog
        error={error}
        onClose={() => setError(null)}
        onRedirect={(target) => void guard(() => am.resolve(target as never))}
      />
    </>
  );

  return { run, guard, ui };
}
