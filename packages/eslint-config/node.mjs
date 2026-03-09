import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
export const nodeConfig = [
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-unused-expressions": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
