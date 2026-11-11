import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "../Button/Button";
import { Tooltip } from "./Tooltip";

const meta: Meta<typeof Tooltip> = { title: "Primitives/Tooltip", component: Tooltip };
export default meta;

export const OnButton: StoryObj<typeof Tooltip> = {
  render: () => (
    <Tooltip content="Archived records are hidden from searches">
      <Button variant="ghost">Archive</Button>
    </Tooltip>
  ),
};
