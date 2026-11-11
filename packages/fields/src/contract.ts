/**
 * The one contract every field widget implements (COMPONENT-ARCHITECTURE §2, L3).
 * Views never special-case a widget: they build FieldProps (via the engine's useField) and render
 * whatever the registry resolves. Meaning comes from Odoo metadata, never from the widget.
 * Layout (labels, density, columns) belongs to the L2 patterns around the widget, not to the widget.
 */
import type { FieldMeta, OdooContext } from "@novi/odoo-meta";
import type { ComponentType } from "react";

export type FieldMode = "read" | "edit";

export interface FieldProps<V = unknown> {
  /** Technical field name (`partner_id`). */
  name: string;
  value: V;
  /** fields_get / get_views metadata: type, string, relation, selection, digits, currency_field… */
  meta: FieldMeta;
  /** Parsed arch `options="{…}"`. */
  options: Readonly<Record<string, unknown>>;
  mode: FieldMode;
  /** Already evaluated from arch modifiers + meta by odoo-expr; widgets never re-derive it. */
  readonly: boolean;
  required: boolean;
  /** Validation message from Odoo (or the required check on save). */
  invalid?: string;
  /** Record values + user context, for domains/defaults of relational widgets. */
  context: Readonly<OdooContext>;
  /** The engine turns this into dirty state + onchange. */
  onChange(value: V): void;
}

// The registry stores widgets for many value types side by side, so it erases V.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous widget map; each widget keeps its own V
export type FieldComponent = ComponentType<FieldProps<any>>;

export interface FieldDefinition {
  component: FieldComponent;
  /** Odoo field types this widget can render. */
  types: readonly string[];
  /** Arch `widget="…"` name; omit for a type's default widget. */
  widget?: string;
}
