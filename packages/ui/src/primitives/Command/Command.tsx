import { Command as Cmdk } from "cmdk";
import { Search } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { cn } from "../../lib/cn";
import { useT } from "../../lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "../Dialog/Dialog";

/** ⌘K command palette building blocks (P1.13): search menus, actions and records. */
export const Command = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Cmdk>>(
  ({ className, ...props }, ref) => (
    <Cmdk
      ref={ref}
      className={cn("flex w-full flex-col overflow-hidden bg-surface text-text", className)}
      {...props}
    />
  ),
);
Command.displayName = "Command";

export const CommandInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof Cmdk.Input>>(
  ({ className, ...props }, ref) => {
    const t = useT();
    return (
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="size-4 text-text-muted" aria-hidden />
        <Cmdk.Input
          ref={ref}
          placeholder={t("search")}
          className={cn(
            "h-11 w-full bg-transparent text-base outline-none placeholder:text-text-muted",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
CommandInput.displayName = "CommandInput";

export const CommandList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Cmdk.List>>(
  ({ className, ...props }, ref) => (
    <Cmdk.List ref={ref} className={cn("max-h-80 overflow-y-auto p-1", className)} {...props} />
  ),
);
CommandList.displayName = "CommandList";

export function CommandEmpty(props: ComponentPropsWithoutRef<typeof Cmdk.Empty>) {
  const t = useT();
  return (
    <Cmdk.Empty className="py-6 text-center text-sm text-text-muted" {...props}>
      {props.children ?? t("noResults")}
    </Cmdk.Empty>
  );
}

export const CommandGroup = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Cmdk.Group>>(
  ({ className, ...props }, ref) => (
    <Cmdk.Group
      ref={ref}
      className={cn(
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-text-muted",
        className,
      )}
      {...props}
    />
  ),
);
CommandGroup.displayName = "CommandGroup";

export const CommandItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Cmdk.Item>>(
  ({ className, ...props }, ref) => (
    <Cmdk.Item
      ref={ref}
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-sm [&_svg]:size-4",
        "data-[selected=true]:bg-surface-sunken data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
CommandItem.displayName = "CommandItem";

/** The palette in a dialog (opened with ⌘K by the shell). */
export function CommandDialog({
  open,
  onOpenChange,
  filter,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Custom ranking (cmdk `filter`); default is cmdk's fuzzy match. */
  filter?: ComponentPropsWithoutRef<typeof Cmdk>["filter"];
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="gap-0 p-0"
        // Radix selects the input's text on open, so the next keystroke would replace text the user
        // already typed (type-to-search). Focus with the caret at the end instead.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const input = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>(
            "[cmdk-input]",
          );
          input?.focus();
          input?.setSelectionRange(input.value.length, input.value.length);
        }}
      >
        <DialogTitle className="sr-only">{t("search")}</DialogTitle>
        <Command filter={filter}>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}
