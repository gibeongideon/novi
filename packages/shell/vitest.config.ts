import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "jsdom", setupFiles: ["../ui/test/setup.ts"] } });
