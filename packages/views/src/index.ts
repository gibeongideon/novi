/** @novi/views: view renderers (P2) and the L5 override registry. */
export { FormView, type FormViewProps } from "./FormView.js";
export { ListView, type ListViewProps } from "./ListView.js";
export * from "./overrides.js";

/**
 * Odoo widgets the views render themselves (not field widgets): status bar and smart-button
 * stats in forms, drag handle in lists, ribbon. For the coverage scanner (P2.13.13).
 */
export const VIEW_WIDGETS = ["statusbar", "statinfo", "handle", "web_ribbon"] as const;
