import type { Meta, StoryObj } from "@storybook/react";
import { FileText, Users } from "lucide-react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./Command";

const meta: Meta = { title: "Primitives/Command" };
export default meta;

export const Palette: StoryObj = {
  render: () => (
    <div className="w-[560px] rounded-lg border border-border shadow-md">
      <Command>
        <CommandInput />
        <CommandList>
          <CommandEmpty />
          <CommandGroup heading="Menus">
            <CommandItem>
              <FileText aria-hidden />
              Sales / Quotations
            </CommandItem>
            <CommandItem>
              <FileText aria-hidden />
              Accounting / Customer invoices
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Records">
            <CommandItem>
              <Users aria-hidden />
              Acme Corporation
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
};
