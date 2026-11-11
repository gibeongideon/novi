import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "../Button/Button";
import { Input } from "../Input/Input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "./Dialog";

const meta: Meta = { title: "Primitives/Dialog" };
export default meta;

export const Confirmation: StoryObj = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="danger">Cancel order</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogTitle>Cancel S00042?</DialogTitle>
        <DialogDescription>
          The quotation will be cancelled. You can reset it to draft later.
        </DialogDescription>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Keep</Button>
          </DialogClose>
          <Button variant="danger">Cancel order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Wizard: StoryObj = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent size="md">
        <DialogTitle>Register payment</DialogTitle>
        <DialogDescription>Odoo wizard (target=&quot;new&quot;) rendered as a dialog.</DialogDescription>
        <Input aria-label="Amount" defaultValue="1,250.00" />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Discard</Button>
          </DialogClose>
          <Button variant="primary">Create payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
