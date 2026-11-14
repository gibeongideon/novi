/**
 * integer, float and monetary (P2.13.2): shown and typed in the user's own number format
 * (Odoo's language settings through the engine formatter). Text that isn't a number is reported
 * to the record, which refuses saving until it is corrected.
 */
import { useFormat } from "@novi/engine";
import { Input, useT } from "@novi/ui";
import { useEffect, useState } from "react";

import type { FieldProps } from "./contract.js";
import { FallbackField } from "./FallbackField.js";

export function NumberField(props: FieldProps<number | false>) {
  const { value, meta, mode, readonly, invalid, onChange, onInvalid, name } = props;
  const fmt = useFormat();
  const t = useT();
  const digits = (meta.digits as [number, number] | undefined)?.[1];
  const shown = (v: number | false) =>
    v === false || v === null || v === undefined
      ? ""
      : meta.type === "integer"
        ? fmt.integer(v)
        : fmt.float(v, { digits });
  const [draft, setDraft] = useState(shown(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the formatter is stable per session
  useEffect(() => setDraft(shown(value)), [value]);
  if (mode === "read" || readonly) return <FallbackField {...props} />;
  // the element's own value: a blur can come before React has rendered the last keystroke
  const commit = (raw: string) => {
    const text = raw.trim();
    const n = text ? fmt.parseNumber(text) : 0;
    if (Number.isNaN(n) || (meta.type === "integer" && !Number.isInteger(n))) {
      onInvalid?.(t("invalidNumber"));
      return;
    }
    if (n !== value) onChange(n);
    else setDraft(shown(value));
  };
  return (
    <Input
      id={name}
      aria-label={props.label}
      inputMode="decimal"
      className="text-end tabular-nums"
      value={draft}
      invalid={invalid}
      aria-required={props.required || undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
    />
  );
}
