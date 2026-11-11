import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Primitives/Input",
  component: Input,
  args: { placeholder: "Customer reference", "aria-label": "Customer reference" },
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};
export const Filled: Story = { args: { defaultValue: "PO-2026-0042" } };
export const Invalid: Story = { args: { invalid: "This field is required" } };
export const ReadOnly: Story = { args: { readOnly: true, defaultValue: "S00042" } };
export const Disabled: Story = { args: { disabled: true } };
