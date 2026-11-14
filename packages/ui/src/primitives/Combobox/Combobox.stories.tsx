import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { Combobox } from "./Combobox";

const ALL = ["Azure Interior", "Deco Addict", "Gemini Furniture", "Lumber Inc", "Ready Mat"];

function Demo({ invalid }: { invalid?: string }) {
  const [value, setValue] = useState("Deco Addict");
  const [text, setText] = useState("");
  const options = ALL.filter((n) => n.toLowerCase().includes(text.toLowerCase())).map((n) => ({
    id: n,
    label: n,
  }));
  return (
    <Combobox
      aria-label="Customer"
      value={value}
      options={options}
      invalid={invalid}
      onSearch={setText}
      onSelect={(o) => setValue(o?.label ?? "")}
    />
  );
}

const meta: Meta<typeof Demo> = { title: "Primitives/Combobox", component: Demo };
export default meta;
type Story = StoryObj<typeof Demo>;

export const Default: Story = {};
export const Invalid: Story = { args: { invalid: "This field is required" } };
