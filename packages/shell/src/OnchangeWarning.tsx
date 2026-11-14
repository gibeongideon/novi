import type { OnchangeWarning } from "@novi/engine";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  toast,
  useT,
} from "@novi/ui";
import { useCallback, useState } from "react";

/**
 * Onchange warnings (P2.10.10): Odoo's `type: "notification"` as a toast, anything else (Odoo's
 * default, `dialog`) as a dialog the user closes. Title and message are Odoo's own.
 */
export function useOnchangeWarnings() {
  const [warning, setWarning] = useState<OnchangeWarning | null>(null);
  const show = useCallback((w: OnchangeWarning) => {
    if (w.type === "notification") toast.warning(w.message, { description: w.title });
    else setWarning(w);
  }, []);
  return { warning, show, close: () => setWarning(null) };
}

export function OnchangeWarningDialog({
  warning,
  close,
}: {
  warning: OnchangeWarning | null;
  close(): void;
}) {
  const t = useT();
  return (
    <Dialog open={!!warning} onOpenChange={(open) => !open && close()}>
      <DialogContent size="sm">
        <DialogTitle>{warning?.title}</DialogTitle>
        <DialogDescription className="whitespace-pre-line">{warning?.message}</DialogDescription>
        <DialogFooter>
          <Button variant="primary" onClick={close}>
            {t("ok")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
