/**
 * integer, float and monetary (P2.13.2), and the `monetary`, `percentage` and `float_time`
 * widgets: shown and typed in the user's own number format (Odoo's language settings through the
 * engine formatter). Text that isn't a number is reported to the record, which refuses saving
 * until it is corrected.
 */
import { type Formatter, useFormat } from "@novi/engine";
import { Input, useT } from "@novi/ui";
import { useEffect, useState } from "react";

import type { FieldComponent, FieldProps } from "./contract.js";
import { FallbackField } from "./FallbackField.js";

type Kind = "number" | "percentage" | "float_time";

/** "1:30" → 1.5, "-0:15" → -0.25; plain numbers pass through (Odoo's float_time parser). */
export function parseFloatTime(text: string, fmt: Formatter): number {
  const m = /^(-)?(\d+):([0-5]?\d)$/.exec(text.trim());
  if (!m) return fmt.parseNumber(text);
  const v = Number(m[2]) + Number(m[3]) / 60;
  return m[1] ? -v : v;
}

function NumberInput({ kind, ...props }: FieldProps<number | false> & { kind: Kind }) {
  const { value, meta, mode, readonly, invalid, onChange, onInvalid, name } = props;
  const fmt = useFormat();
  const t = useT();
  const digits = (meta.digits as [number, number] | undefined)?.[1];
  const empty = value === false || value === null || value === undefined;
  const shown = (v: number | false) =>
    v === false || v === null || v === undefined
      ? ""
      : kind === "float_time"
        ? fmt.floatTime(v)
        : kind === "percentage"
          ? fmt.float(v * 100, { digits: 2 }).replace(/[.,]?0+$/, "")
          : meta.type === "integer"
            ? fmt.integer(v)
            : fmt.float(v, { digits });
  const [draft, setDraft] = useState(shown(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the formatter is stable per session
  useEffect(() => setDraft(shown(value)), [value]);
  if (mode === "read" || readonly) {
    if (kind === "number" || empty) return <FallbackField {...props} />;
    return <>{kind === "float_time" ? fmt.floatTime(value) : fmt.percentage(value)}</>;
  }
  // the element's own value: a blur can come before React has rendered the last keystroke
  const commit = (raw: string) => {
    const text = raw.trim().replace(/%$/, "");
    let n = !text ? 0 : kind === "float_time" ? parseFloatTime(text, fmt) : fmt.parseNumber(text);
    if (Number.isNaN(n) || (meta.type === "integer" && !Number.isInteger(n))) {
      onInvalid?.(t("invalidNumber"));
      return;
    }
    if (kind === "percentage") n /= 100;
    if (n !== value) onChange(n);
    else setDraft(shown(value));
  };
  return (
    <div className="flex items-center gap-1">
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
      {kind === "percentage" ? <span className="text-text-muted">%</span> : null}
    </div>
  );
}

const numberKind =
  (kind: Kind): FieldComponent =>
  (props: FieldProps<number | false>) => <NumberInput {...props} kind={kind} />;

export const NumberField = numberKind("number");
export const PercentageField = numberKind("percentage");
export const FloatTimeField = numberKind("float_time");
