import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = { title: "Primitives/Badge", component: Badge };
export default meta;
type Story = StoryObj<typeof Badge>;

export const AllTones: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge>Draft</Badge>
      <Badge tone="info">Sent</Badge>
      <Badge tone="success">Paid</Badge>
      <Badge tone="warning">Partially paid</Badge>
      <Badge tone="danger">Overdue</Badge>
    </div>
  ),
};
