/**
 * boolean (P2.13.3), and the `boolean_toggle` widget as a switch: one control in every mode;
 * read-only is a disabled control.
 */
import { cn } from "@novi/ui";

import type { FieldComponent, FieldProps } from "./contract.js";

function Bool({ toggle, ...p }: FieldProps<boolean> & { toggle: boolean }) {
  const disabled = p.mode === "read" || p.readonly;
  if (!toggle)
    return (
      <input
        id={p.name}
        aria-label={p.label}
        type="checkbox"
        className="size-4 accent-primary"
        checked={!!p.value}
        disabled={disabled}
        onChange={(e) => p.onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  return (
    <button
      id={p.name}
      type="button"
      role="switch"
      aria-checked={!!p.value}
      aria-label={p.label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        p.onChange(!p.value);
      }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        p.value ? "bg-primary" : "bg-border",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-4 rounded-full bg-surface shadow transition-transform",
          p.value ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export const BooleanField: FieldComponent = (p: FieldProps<boolean>) => <Bool {...p} toggle={false} />;
export const ToggleField: FieldComponent = (p: FieldProps<boolean>) => <Bool {...p} toggle />;
