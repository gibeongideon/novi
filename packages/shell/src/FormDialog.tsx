import { type OdooRecord, useFormView, type WindowAction } from "@novi/engine";
import type { ButtonNode, FormSchema } from "@novi/odoo-meta";
import { Button, Dialog, DialogContent, DialogTitle, Skeleton, useT } from "@novi/ui";
import { FormView } from "@novi/views";
import { useState } from "react";

import { OnchangeWarningDialog, useOnchangeWarnings } from "./OnchangeWarning";

/** Odoo's buttons for a dialog without a `<footer>`: save and close, or discard. */
const SAVE: ButtonNode = { type: "button", special: "save", primary: true };
const CANCEL: ButtonNode = { type: "button", special: "cancel" };

/**
 * A window action with `target: "new"` (wizards, preferences): the same generic form view, in a
 * dialog. Its buttons go through the ActionManager; "close" closes it and refreshes the screen
 * that opened it (useActionRunner).
 */
export function FormDialog({
  action,
  onClose,
  onButton,
}: {
  action: WindowAction;
  onClose(): void;
  onButton(record: OdooRecord, button: ButtonNode): void;
}) {
  const t = useT();
  const warnings = useOnchangeWarnings();
  const [showErrors, setShowErrors] = useState(false);
  const form = useFormView(
    {
      model: action.model,
      viewId: action.views.find(([, type]) => type === "form")?.[0] ?? false,
      resId: action.resId,
      context: action.context,
      actionId: action.id,
    },
    warnings.show,
  );
  const record = form.data?.record;
  const hasFooter = (record?.config.schema as FormSchema | undefined)?.children.some(
    (n) => n.type === "footer" || (n.type === "sheet" && n.children.some((c) => c.type === "footer")),
  );
  const press = (button: ButtonNode) => {
    if (!record) return;
    if (button.special === "cancel") return onClose();
    if (record.invalidFields().length) setShowErrors(true);
    onButton(record, button);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
        <DialogTitle>{action.name}</DialogTitle>
        {form.isError ? (
          <p role="alert" className="text-danger">
            {(form.error as Error).message}
          </p>
        ) : !record ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <FormView record={record} onButton={press} showErrors={showErrors} />
            {hasFooter ? null : (
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => press(SAVE)}>
                  {t("save")}
                </Button>
                <Button variant="ghost" onClick={() => press(CANCEL)}>
                  {t("discard")}
                </Button>
              </div>
            )}
          </>
        )}
        <OnchangeWarningDialog {...warnings} />
      </DialogContent>
    </Dialog>
  );
}
