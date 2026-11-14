import type { Meta, StoryObj } from "@storybook/react";

import { Stepper } from "./Stepper";

const steps = [
  { key: "draft", label: "Quotation" },
  { key: "sent", label: "Quotation Sent" },
  { key: "sale", label: "Sales Order" },
];

const meta: Meta<typeof Stepper> = {
  title: "Patterns/Stepper",
  component: Stepper,
  args: { steps, current: "sent", "aria-label": "Status" },
};
export default meta;
type Story = StoryObj<typeof Stepper>;

export const Default: Story = {};
export const Clickable: Story = { args: { onSelect: () => undefined } };
