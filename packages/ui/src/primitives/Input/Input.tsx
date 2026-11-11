import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Validation message from Odoo; sets aria-invalid and the danger border. */
  invalid?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid ? true : undefined}
    className={cn(
      "h-9 w-full rounded-md border border-border bg-surface px-3 text-base text-text placeholder:text-text-muted",
      "read-only:border-transparent read-only:bg-transparent read-only:px-0",
      "disabled:cursor-not-allowed disabled:opacity-50",
      invalid && "border-danger",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
