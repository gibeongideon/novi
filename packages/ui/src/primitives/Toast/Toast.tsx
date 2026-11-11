import { Toaster as Sonner } from "sonner";

/**
 * Notifications (Odoo `display_notification`, save confirmations, errors). Mount <Toaster/> once;
 * call `toast.success(...)` / `toast.error(...)` anywhere. Styled with tokens.
 */
export { toast } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "rounded-md border border-border bg-surface text-text shadow-md",
          description: "text-text-muted",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warning",
        },
      }}
    />
  );
}
