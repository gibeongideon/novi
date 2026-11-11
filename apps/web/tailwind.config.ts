import type { Config } from "tailwindcss";

import noviPreset from "../../packages/ui/tailwind-preset";

export default {
  presets: [noviPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/*/src/**/*.{ts,tsx}"],
} satisfies Config;
