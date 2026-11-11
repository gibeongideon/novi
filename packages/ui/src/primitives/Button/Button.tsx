import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "../../lib/cn";

/** One primary action per surface (UI-RULES §4); everything else secondary/ghost. */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-text hover:opacity-90",
        secondary: "border border-border bg-surface text-text hover:bg-surface-sunken",
        ghost: "text-text hover:bg-surface-sunken",
        danger: "bg-danger text-primary-text hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-9 px-4 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a router link) with button styling. */
  asChild?: boolean;
  /** Shows a spinner and blocks clicks while an Odoo call is running. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    // Slot needs exactly one child, so asChild (links etc.) renders the child as-is, without a spinner
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
