import type { Meta, StoryObj } from "@storybook/react";

import { Avatar } from "./Avatar";

const meta: Meta<typeof Avatar> = {
  title: "Primitives/Avatar",
  component: Avatar,
  args: { name: "Wanjiru Kamau" },
};
export default meta;
type Story = StoryObj<typeof Avatar>;

export const Initials: Story = {};
export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Avatar {...args} size="sm" />
      <Avatar {...args} size="md" />
      <Avatar {...args} size="lg" />
    </div>
  ),
};
export const BrokenImage: Story = { args: { src: "/missing.png" } };
