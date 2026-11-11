import type { Meta, StoryObj } from "@storybook/react";

import { Breadcrumb } from "./Breadcrumb";

const meta: Meta<typeof Breadcrumb> = { title: "Primitives/Breadcrumb", component: Breadcrumb };
export default meta;
type Story = StoryObj<typeof Breadcrumb>;

export const ActionStack: Story = {
  args: { items: [{ label: "Quotations", onSelect: () => undefined }, { label: "S00042" }] },
};
export const LongTitles: Story = {
  args: {
    items: [
      { label: "Customer invoices and credit notes awaiting payment", onSelect: () => undefined },
      { label: "INV/2026/00042 — Acme Corporation International Holdings Ltd" },
    ],
  },
  decorators: [(S) => <div className="w-80">{S()}</div>],
};
