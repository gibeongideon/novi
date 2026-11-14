/**
 * A record's form, loaded the way Odoo's own client loads it (P2.10): `get_views` for the form
 * view the action names (or the model's default), the record read with the view's specification
 * (`web_read`), or a new one from Odoo's defaults (`onchange` with no field names). The record is
 * the live engine model: modifiers, onchange, saving and buttons all go through it.
 */
import type { OdooContext } from "@novi/odoo-client";
import type { EvalContext } from "@novi/odoo-expr";
import { buildSpec, type FormSchema, type ModelsInfo, parseView } from "@novi/odoo-meta";

import { actionEvalContext, readContext, type ToolbarItem } from "./listView.js";
import type { Rpc } from "./model/observable.js";
import { OdooRecord, type OnchangeWarning, type RecordConfig } from "./model/record.js";

export interface FormTarget {
  model: string;
  /** The form view to use (the action's), or the model's default. */
  viewId?: number | false;
  /** A saved record, or a new one. */
  resId?: number;
  /** The action's context (defaults, active ids…). */
  context?: OdooContext;
  /** The action, for its toolbar (Action / Print menus). */
  actionId?: number;
}

export interface FormViewData {
  schema: FormSchema;
  record: OdooRecord;
  toolbar: { action: ToolbarItem[]; print: ToolbarItem[] };
}

export async function loadFormView(
  rpc: Rpc,
  target: FormTarget,
  base: EvalContext,
  onWarning?: (w: OnchangeWarning) => void,
): Promise<FormViewData> {
  const actionContext = target.context ?? {};
  const views = await rpc<{
    views: { form: { arch: string; toolbar?: FormViewData["toolbar"] } };
    models: ModelsInfo;
  }>(target.model, "get_views", {
    kwargs: {
      views: [[target.viewId ?? false, "form"]],
      options: { action_id: target.actionId ?? false, toolbar: true },
      context: actionContext,
    },
  });
  const schema = parseView({
    arch: views.views.form.arch,
    model: target.model,
    models: views.models,
  }) as FormSchema;
  const evalContext = actionEvalContext(actionContext, base);
  const config: RecordConfig = {
    model: target.model,
    models: views.models,
    spec: buildSpec(schema, { evalContext }),
    schema,
    context: readContext(actionContext),
    evalContext,
    onWarning,
  };
  const record = target.resId
    ? await OdooRecord.load(rpc, config, target.resId)
    : await OdooRecord.createWithDefaults(rpc, config);
  const toolbar = views.views.form.toolbar;
  return { schema, record, toolbar: { action: toolbar?.action ?? [], print: toolbar?.print ?? [] } };
}
