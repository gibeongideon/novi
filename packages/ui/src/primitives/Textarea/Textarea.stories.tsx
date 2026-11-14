import type { Meta, StoryObj } from "@storybook/react";

import { Textarea } from "./Textarea";

const meta: Meta<typeof Textarea> = {
  title: "Primitives/Textarea",
  component: Textarea,
  args: { placeholder: "Internal notes", "aria-label": "Notes" },
};
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {};
export const Invalid: Story = { args: { invalid: "This field is required" } };
