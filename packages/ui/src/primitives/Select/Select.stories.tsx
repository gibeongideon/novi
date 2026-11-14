import type { Meta, StoryObj } from "@storybook/react";

import { Select } from "./Select";

const meta: Meta<typeof Select> = {
  title: "Primitives/Select",
  component: Select,
  args: {
    "aria-label": "Status",
    children: [
      <option key="d" value="draft">
        Quotation
      </option>,
      <option key="s" value="sale">
        Sales Order
      </option>,
    ],
  },
};
export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {};
export const Invalid: Story = { args: { invalid: "This field is required" } };
export const Disabled: Story = { args: { disabled: true } };
