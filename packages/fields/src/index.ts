/** @novi/fields: field widget contract, registry and widgets (L3). */
import { FallbackField } from "./FallbackField.js";
import { fieldRegistry } from "./registry.js";

export type * from "./contract.js";
export { FallbackField } from "./FallbackField.js";
export * from "./registry.js";

// any field renders, even before its own widget exists (P2.13.11)
fieldRegistry.setFallback(FallbackField);
