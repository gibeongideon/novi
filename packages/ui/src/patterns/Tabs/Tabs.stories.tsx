import type { Meta, StoryObj } from "@storybook/react";

import { Tabs } from "./Tabs";

const meta: Meta<typeof Tabs> = {
  title: "Patterns/Tabs",
  component: Tabs,
  args: {
    items: [
      { key: "lines", label: "Order Lines", content: <p>Lines</p> },
      { key: "other", label: "Other Info", content: <p>Salesperson, delivery…</p> },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {};
