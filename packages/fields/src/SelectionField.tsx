/**
 * selection (P2.13.4), and its `radio`, `badge` and `priority` widgets. The options are Odoo's
 * own (`selection` metadata), in Odoo's order.
 */
import { Badge, cn, Select, useT } from "@novi/ui";
import { Star } from "lucide-react";

import type { FieldProps } from "./contract.js";
import { FallbackField } from "./FallbackField.js";

const editable = (p: FieldProps) => p.mode === "edit" && !p.readonly;

export function SelectionField(props: FieldProps<string | false>) {
  const { name, value, meta, required, invalid, onChange } = props;
  if (!editable(props)) return <FallbackField {...props} />;
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

/** Every option visible at once; `horizontal` lays them out in a row. */
export function RadioField(props: FieldProps<string | false>) {
  const { name, value, meta, options, onChange } = props;
  const disabled = !editable(props);
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      id={name}
      className={cn("flex gap-x-4 gap-y-1", options.horizontal ? "flex-wrap" : "flex-col")}
    >
      {(meta.selection ?? []).map(([key, label]) => (
        <label key={key} className="inline-flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={name}
            className="accent-primary"
            checked={value === key}
            disabled={disabled}
            onChange={() => onChange(key)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

/** The value as a badge (states, kinds); edited as a plain selection. */
export function BadgeField(props: FieldProps<string | false>) {
  if (editable(props) && props.meta.type === "selection") return <SelectionField {...props} />;
  const { value, meta } = props;
  if (!value) return null;
  const label =
    meta.type === "selection"
      ? (meta.selection?.find(([k]) => k === value)?.[1] ?? value)
      : typeof value === "object"
        ? String((value as { display_name?: string }).display_name ?? "")
        : String(value);
  return <Badge>{label}</Badge>;
}

/** Stars: the options after the first ("Normal") are the levels; clicking the current one clears it. */
export function PriorityField(props: FieldProps<string | false>) {
  const t = useT();
  const { value, meta, onChange } = props;
  const levels = (meta.selection ?? []).slice(1);
  const at = levels.findIndex(([k]) => k === value);
  const disabled = props.readonly; // priority is clickable in lists and cards too, like Odoo
  return (
    <span className="inline-flex" role="group" aria-label={props.label ?? meta.string}>
      {levels.map(([key, label], i) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          title={label}
          aria-pressed={i <= at}
          aria-label={label || t("priority")}
          onClick={(e) => {
            e.stopPropagation();
            onChange(i === at ? (meta.selection?.[0]?.[0] ?? false) : key);
          }}
          className="p-0.5 disabled:cursor-default"
        >
          <Star
            aria-hidden
            className={cn("size-4", i <= at ? "fill-warning text-warning" : "text-text-muted")}
          />
        </button>
      ))}
    </span>
  );
}
