/** @novi/fields: field widget contract, registry and widgets (L3). */
import { BooleanField, ToggleField } from "./BooleanField.js";
import { DateField } from "./DateField.js";
import { FallbackField } from "./FallbackField.js";
import { ImageField } from "./ImageField.js";
import { Many2OneAvatarField, Many2OneField } from "./Many2OneField.js";
import { FloatTimeField, NumberField, PercentageField } from "./NumberField.js";
import { fieldRegistry } from "./registry.js";
import { BadgeField, PriorityField, RadioField, SelectionField } from "./SelectionField.js";
import { TagsField } from "./TagsField.js";
import { EmailField, MultilineField, PhoneField, TextField, UrlField } from "./TextField.js";

export type * from "./contract.js";
export { localInputToUtc, utcToLocalInput } from "./DateField.js";
export { FallbackField } from "./FallbackField.js";
export { parseFloatTime } from "./NumberField.js";
export * from "./registry.js";

// each type's default widget, read and edit (P2.13.1–6, 9)
fieldRegistry
  .register({ types: ["char", "text"], component: TextField })
  .register({ types: ["integer", "float", "monetary"], component: NumberField })
  .register({ types: ["boolean"], component: BooleanField })
  .register({ types: ["selection"], component: SelectionField })
  .register({ types: ["date", "datetime"], component: DateField })
  .register({ types: ["many2one"], component: Many2OneField })
  .register({ types: ["image"], component: ImageField });

// named widgets: their own behaviour, or Odoo's names for what a type's widget already does
// (registered so the coverage scanner counts them as native)
fieldRegistry
  .register({ widget: "text", types: ["char"], component: MultilineField })
  .register({ widget: "email", types: ["char"], component: EmailField })
  .register({ widget: "phone", types: ["char"], component: PhoneField })
  .register({ widget: "url", types: ["char"], component: UrlField })
  .register({ widget: "percentage", types: ["integer", "float"], component: PercentageField })
  .register({ widget: "float_time", types: ["float"], component: FloatTimeField })
  .register({ widget: "boolean_toggle", types: ["boolean"], component: ToggleField })
  .register({ widget: "radio", types: ["selection"], component: RadioField })
  .register({ widget: "badge", types: ["selection", "many2one", "char"], component: BadgeField })
  .register({ widget: "priority", types: ["selection"], component: PriorityField })
  .register({ widget: "many2one_avatar", types: ["many2one"], component: Many2OneAvatarField })
  .register({ widget: "many2one_avatar_user", types: ["many2one"], component: Many2OneAvatarField })
  .register({ widget: "many2one_avatar_employee", types: ["many2one"], component: Many2OneAvatarField })
  .register({ widget: "many2many_tags", types: ["many2many", "one2many"], component: TagsField })
  .register({ widget: "image", types: ["binary", "image"], component: ImageField })
  .register({ widget: "monetary", types: ["float", "monetary", "integer"], component: NumberField })
  .register({ widget: "float", types: ["float"], component: NumberField })
  .register({ widget: "upgrade_boolean", types: ["boolean"], component: BooleanField })
  .register({ widget: "res_partner_many2one", types: ["many2one"], component: Many2OneField })
  .register({ widget: "many2one_bank", types: ["many2one"], component: Many2OneField })
  .register({ widget: "many2many_tax_tags", types: ["many2many"], component: TagsField })
  .register({ widget: "many2many_avatar_user", types: ["many2many"], component: TagsField });

// any field renders, even before its own widget exists (P2.13.11)
fieldRegistry.setFallback(FallbackField);
