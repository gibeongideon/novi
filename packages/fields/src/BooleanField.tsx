/** boolean (P2.13.3): one checkbox in every mode; read-only is a disabled checkbox. */
import type { FieldProps } from "./contract.js";

export function BooleanField({ name, value, mode, readonly, onChange, label }: FieldProps<boolean>) {
  return (
    <input
      id={name}
      aria-label={label}
      type="checkbox"
      className="size-4 accent-primary"
      checked={!!value}
      disabled={mode === "read" || readonly}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
