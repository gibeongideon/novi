// Tailwind config for Storybook (apps have their own config using the same preset).
import type { Config } from "tailwindcss";

import noviPreset from "./tailwind-preset";

export default {
  presets: [noviPreset],
  content: ["./src/**/*.{ts,tsx}", "./.storybook/**/*.{ts,tsx}"],
} satisfies Config;
