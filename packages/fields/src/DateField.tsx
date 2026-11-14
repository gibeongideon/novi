/**
 * date and datetime (P2.13.5): the platform's date pickers. Odoo stores datetimes in UTC
 * ("YYYY-MM-DD HH:MM:SS"); they are edited in the browser's time zone, as Odoo's client does.
 */
import { Input } from "@novi/ui";

import type { FieldProps } from "./contract.js";
import { FallbackField } from "./FallbackField.js";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-14 08:30:00" (UTC) → "2026-11-14T11:30" (local, for datetime-local). */
export function utcToLocalInput(v: string): string {
  const d = new Date(`${v.replace(" ", "T")}Z`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The inverse: a local "YYYY-MM-DDTHH:MM" → Odoo's UTC "YYYY-MM-DD HH:MM:SS". */
export function localInputToUtc(v: string): string {
  return new Date(v).toISOString().slice(0, 19).replace("T", " ");
}

export function DateField(props: FieldProps<string | false>) {
  const { name, value, meta, mode, readonly, required, invalid, onChange } = props;
  if (mode === "read" || readonly) return <FallbackField {...props} />;
  const isDatetime = meta.type === "datetime";
  return (
    <Input
      id={name}
      aria-label={props.label}
      type={isDatetime ? "datetime-local" : "date"}
      value={value ? (isDatetime ? utcToLocalInput(value) : value) : ""}
      invalid={invalid}
      aria-required={required || undefined}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? (isDatetime ? localInputToUtc(v) : v) : false);
      }}
    />
  );
}
