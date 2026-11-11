/**
 * Odoo metadata types shared by the UI layers. Single source: @novi/odoo-client.
 * UI packages may not import the transport (layer rule), so they take these types from here.
 */
export type { FieldInfo as FieldMeta, OdooContext } from "@novi/odoo-client";

/** Odoo field types as returned by fields_get (`type`). */
export type FieldType =
  | "boolean"
  | "binary"
  | "char"
  | "date"
  | "datetime"
  | "float"
  | "html"
  | "image"
  | "integer"
  | "json"
  | "many2many"
  | "many2one"
  | "many2one_reference"
  | "monetary"
  | "one2many"
  | "properties"
  | "properties_definition"
  | "reference"
  | "selection"
  | "text";

/** Odoo view types this project knows about (unknown ones go to the iframe fallback). */
export type ViewType =
  | "list"
  | "form"
  | "kanban"
  | "search"
  | "calendar"
  | "pivot"
  | "graph"
  | "activity"
  | "map"
  | "hierarchy"
  | "gantt"
  | "cohort"
  | "grid";
