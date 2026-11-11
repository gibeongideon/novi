import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef, type HTMLAttributes } from "react";

import { cn } from "../../lib/cn";
import { useT } from "../../lib/i18n";

/** Wizards (`target="new"`), confirmations, quick create. Sizes = layout.dialog tokens. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const sizes = {
  sm: "max-w-[420px]",
  md: "max-w-[640px]",
  lg: "max-w-[880px]",
  xl: "max-w-[1120px]",
} as const;

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: keyof typeof sizes;
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, size = "md", children, ...props }, ref) => {
    const t = useT();
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-text/40" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto",
            "rounded-lg border border-border bg-surface p-6 shadow-lg",
            sizes[size],
            className,
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close
            className="absolute right-3 top-3 rounded-sm p-1 text-text-muted hover:text-text"
            aria-label={t("close")}
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
DialogContent.displayName = "DialogContent";

export const DialogTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("pr-8 text-lg font-semibold", className)} {...props} />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-text-muted", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";

/** Footer actions: primary last (rightmost), per UI-RULES §4. */
export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap justify-end gap-2", className)} {...props} />;
}
