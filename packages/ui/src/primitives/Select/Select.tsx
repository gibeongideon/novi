import { forwardRef, type SelectHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Validation message; sets aria-invalid and the danger border. */
  invalid?: string;
}

/** The platform's own select, in NOVI's input style (keyboard and screen readers for free). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, invalid, ...props }, ref) => (
  <select
    ref={ref}
    aria-invalid={invalid ? true : undefined}
    className={cn(
      "h-9 w-full rounded-md border border-border bg-surface px-2 text-base text-text",
      "disabled:cursor-not-allowed disabled:opacity-50",
      invalid && "border-danger",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";
