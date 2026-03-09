import { defineConfig, globalIgnores } from "eslint/config";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const nodeConfig = defineConfig([
  {
    files: ["**/*.ts", "**/*.mts"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  globalIgnores(["dist/**", "node_modules/**", "*.js", "*.d.ts"]),
]);

export default nodeConfig;
