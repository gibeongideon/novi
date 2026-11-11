import "../src/styles.css";

import { withThemeByDataAttribute } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react";

import { ThemeProvider } from "../src/lib/theme";
import { TooltipProvider } from "../src/primitives/Tooltip/Tooltip";

const preview: Preview = {
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
    backgrounds: { disable: true },
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </ThemeProvider>
    ),
    // toolbar switch: light / dark (UI-RULES §4: every component in both schemes)
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark" },
      defaultTheme: "light",
      attributeName: "data-theme",
      parentSelector: "html",
    }),
  ],
};
export default preview;
