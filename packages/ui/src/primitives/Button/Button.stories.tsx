import type { Meta, StoryObj } from "@storybook/react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  args: { children: "Save" },
  argTypes: { variant: { control: "inline-radio" }, size: { control: "inline-radio" } },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: "primary" } };
export const Secondary: Story = {};
export const Ghost: Story = { args: { variant: "ghost", children: "Discard" } };
export const Danger: Story = {
  args: {
    variant: "danger",
    children: (
      <>
        <Trash2 aria-hidden />
        Delete
      </>
    ),
  },
};
export const WithIcon: Story = {
  args: {
    variant: "primary",
    children: (
      <>
        <Plus aria-hidden />
        New
      </>
    ),
  },
};
export const IconOnly: Story = {
  args: { size: "icon", "aria-label": "New", children: <Plus aria-hidden /> },
};
export const Loading: Story = { args: { variant: "primary", loading: true, children: "Saving" } };
export const Disabled: Story = { args: { disabled: true } };
