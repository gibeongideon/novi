/** @novi/odoo-meta: Odoo view arch → ViewSchema, field specification builder, shared metadata types. */
export { type ModelsInfo, type ParseOptions, parseView } from "./parse.js";
export type * from "./schema.js";
export {
  buildSpec,
  normalizeOrder,
  recordEvalValues,
  type SpecOptions,
  viewFields,
  X2MANY_LIMIT,
} from "./spec.js";
export type * from "./types.js";
export { elements, parseXml, textOf, type XmlElement, XmlError, type XmlNode } from "./xml.js";
