import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "../Button/Button";
import { toast, Toaster } from "./Toast";

const meta: Meta = { title: "Primitives/Toast" };
export default meta;

export const Kinds: StoryObj = {
  render: () => (
    <div className="flex gap-2">
      <Toaster />
      <Button onClick={() => toast.success("Quotation sent")}>Success</Button>
      <Button onClick={() => toast.error("Invalid fields: Customer")}>Error</Button>
      <Button onClick={() => toast.warning("Partner has unpaid invoices")}>Warning</Button>
    </div>
  ),
};
