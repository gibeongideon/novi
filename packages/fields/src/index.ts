/** @novi/fields: field widget contract, registry and widgets (L3). */
import { BooleanField } from "./BooleanField.js";
import { DateField } from "./DateField.js";
import { FallbackField } from "./FallbackField.js";
import { Many2OneField } from "./Many2OneField.js";
import { NumberField } from "./NumberField.js";
import { fieldRegistry } from "./registry.js";
import { SelectionField } from "./SelectionField.js";
import { TextField } from "./TextField.js";

export type * from "./contract.js";
export { localInputToUtc, utcToLocalInput } from "./DateField.js";
export { FallbackField } from "./FallbackField.js";
export * from "./registry.js";

// each type's default widget, read and edit (P2.13.1–6); a type's other widgets come later
fieldRegistry
  .register({ types: ["char", "text"], component: TextField })
  .register({ types: ["integer", "float", "monetary"], component: NumberField })
  .register({ types: ["boolean"], component: BooleanField })
  .register({ types: ["selection"], component: SelectionField })
  .register({ types: ["date", "datetime"], component: DateField })
  .register({ types: ["many2one"], component: Many2OneField });

// any field renders, even before its own widget exists (P2.13.11)
fieldRegistry.setFallback(FallbackField);
