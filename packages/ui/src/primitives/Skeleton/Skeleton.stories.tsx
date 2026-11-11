import type { Meta, StoryObj } from "@storybook/react";

import { Skeleton } from "./Skeleton";

const meta: Meta<typeof Skeleton> = { title: "Primitives/Skeleton", component: Skeleton };
export default meta;

export const FormRow: StoryObj<typeof Skeleton> = {
  render: () => (
    <div className="grid w-96 gap-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-2/3" />
    </div>
  ),
};
