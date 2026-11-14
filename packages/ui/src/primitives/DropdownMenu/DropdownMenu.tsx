import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { cn } from "../../lib/cn";

/** Action menus (Odoo "Action" / "Print" menus, user menu, overflow "⋯"). */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
/** Single choice inside a menu (e.g. the active company); items announce their checked state. */
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export const DropdownMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Menu.Content>>(
  ({ className, sideOffset = 6, ...props }, ref) => (
    <Menu.Portal>
      <Menu.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn("z-50 min-w-44 rounded-md border border-border bg-surface p-1 shadow-md", className)}
        {...props}
      />
    </Menu.Portal>
  ),
);
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.Item> & { tone?: "default" | "danger" }
>(({ className, tone = "default", ...props }, ref) => (
  <Menu.Item
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
      "data-[highlighted]:bg-surface-sunken data-[disabled]:opacity-50 [&_svg]:size-4",
      tone === "danger" && "text-danger",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuLabel = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Menu.Label>>(
  ({ className, ...props }, ref) => (
    <Menu.Label
      ref={ref}
      className={cn("px-2 py-1 text-xs font-medium text-text-muted", className)}
      {...props}
    />
  ),
);
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.Separator>
>(({ className, ...props }, ref) => (
  <Menu.Separator ref={ref} className={cn("my-1 h-px bg-border", className)} {...props} />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export const DropdownMenuRadioItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <Menu.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none",
      "data-[highlighted]:bg-surface-sunken data-[disabled]:opacity-50 [&_svg]:size-4",
      className,
    )}
    {...props}
  >
    {children}
    <Menu.ItemIndicator className="absolute right-2 inline-flex text-primary">
      <Check aria-hidden />
    </Menu.ItemIndicator>
  </Menu.RadioItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

/** A toggle inside a menu (e.g. which optional list columns show); same look as the radio item. */
export const DropdownMenuCheckboxItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <Menu.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none",
      "data-[highlighted]:bg-surface-sunken data-[disabled]:opacity-50 [&_svg]:size-4",
      className,
    )}
    {...props}
  >
    {children}
    <Menu.ItemIndicator className="absolute right-2 inline-flex text-primary">
      <Check aria-hidden />
    </Menu.ItemIndicator>
  </Menu.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";
