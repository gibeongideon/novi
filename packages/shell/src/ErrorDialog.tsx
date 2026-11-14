import { describeError } from "@novi/engine";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  type MessageKey,
  useT,
} from "@novi/ui";

/**
 * The error dialog for user actions (P2.8.9): NOVI's own title per kind of error, Odoo's own
 * message (already in the user's language), the button of a RedirectWarning, and the server
 * traceback folded away for unexpected errors only.
 */
export function ErrorDialog({
  error,
  onClose,
  onRedirect,
}: {
  error: unknown;
  onClose(): void;
  /** RedirectWarning: open the action Odoo suggests (with its extra context). */
  onRedirect?(action: unknown, context?: Record<string, unknown>): void;
}) {
  const t = useT();
  const info = error === undefined || error === null ? undefined : describeError(error);
  return (
    <Dialog open={!!info} onOpenChange={(open) => !open && onClose()}>
      {info ? (
        <DialogContent>
          <DialogTitle>{t(`error.${info.kind}` as MessageKey)}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{info.message}</DialogDescription>
          {info.debug ? (
            <details className="text-xs text-text-muted">
              <summary>{t("technicalDetails")}</summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap">{info.debug}</pre>
            </details>
          ) : null}
          <DialogFooter>
            {info.redirect && onRedirect ? (
              <Button
                variant="primary"
                onClick={() => {
                  onRedirect(info.redirect!.action, info.redirect!.context);
                  onClose();
                }}
              >
                {info.redirect.buttonText ?? t("ok")}
              </Button>
            ) : null}
            <Button variant={info.redirect ? "secondary" : "primary"} onClick={onClose}>
              {t(info.redirect ? "close" : "ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
