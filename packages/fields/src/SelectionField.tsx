/** selection (P2.13.4): the options are Odoo's own (`selection` metadata), in Odoo's order. */
import { Select } from "@novi/ui";

import type { FieldProps } from "./contract.js";
import { FallbackField } from "./FallbackField.js";

export function SelectionField(props: FieldProps<string | false>) {
  const { name, value, meta, mode, readonly, required, invalid, onChange } = props;
  if (mode === "read" || readonly) return <FallbackField {...props} />;
  return (
    <Select
      id={name}
      aria-label={props.label}
      value={value || ""}
      invalid={invalid}
      aria-required={required || undefined}
      onChange={(e) => onChange(e.target.value || false)}
    >
      {!required || !value ? <option value="" /> : null}
      {(meta.selection ?? []).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </Select>
  );
}
