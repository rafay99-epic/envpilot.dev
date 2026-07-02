import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Only src/**/*.test.ts — roles.ts (and its test) are pure TS with no
    // `vscode` import, so they run hermetically under plain Node, unlike
    // the rest of the extension which requires the VS Code host API.
    include: ["src/**/*.test.ts"],
  },
});
