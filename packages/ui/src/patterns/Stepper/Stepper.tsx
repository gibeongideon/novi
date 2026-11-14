import { Check } from "lucide-react";

import { cn } from "../../lib/cn";

export interface Step {
  key: string | number;
  label: string;
}

export interface StepperProps {
  steps: readonly Step[];
  current: string | number | false;
  /** Clicking a step moves the record there; omit when steps can't be clicked. */
  onSelect?(key: string | number): void;
  "aria-label"?: string;
}

/** Where a record is in its process (a status bar): steps before the current one are done. */
export function Stepper({ steps, current, onSelect, ...aria }: StepperProps) {
  const at = steps.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-sm" aria-label={aria["aria-label"]}>
      {steps.map((s, i) => {
        const state = i < at ? "done" : i === at ? "current" : "todo";
        const body = (
          <>
            {state === "done" ? <Check aria-hidden className="size-3.5" /> : null}
            {s.label}
          </>
        );
        const cls = cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1",
          state === "current" && "bg-primary font-medium text-primary-text",
          state === "done" && "bg-surface-sunken text-text",
          state === "todo" && "text-text-muted",
        );
        return (
          <li key={s.key} aria-current={state === "current" ? "step" : undefined}>
            {onSelect && state !== "current" ? (
              <button
                type="button"
                className={cn(cls, "hover:bg-surface-sunken")}
                onClick={() => onSelect(s.key)}
              >
                {body}
              </button>
            ) : (
              <span className={cls}>{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
