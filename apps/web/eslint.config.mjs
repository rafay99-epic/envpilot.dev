import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Raw palette classes do not compile any more (packages/ui/src/theme.css
// deletes Tailwind's palette with `--color-*: initial`), so typing one yields
// an invisible element rather than an error. This turns that silence into a
// message naming the replacement.
const PALETTE_CLASS =
  "\\b(?:bg|text|border|border-[xytrbles]|divide|divide-[xy]|ring|ring-offset|" +
  "outline|placeholder|from|via|to|fill|stroke|shadow|caret|accent|decoration)" +
  "-(?:zinc|slate|gray|neutral|stone|green|emerald|lime|amber|yellow|orange|" +
  "red|rose|blue|sky|indigo|cyan|teal|purple|violet|fuchsia|pink)-\\d{2,3}";

const PALETTE_MESSAGE =
  "Raw palette class. Use a design token (bg-surface, text-ink, border-line, " +
  "text-accent) — see packages/ui/src/theme.css.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/exhaustive-deps": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${PALETTE_CLASS}/]`,
          message: PALETTE_MESSAGE,
        },
        {
          // Template literals hold the class strings in the shared primitives,
          // and their value is an object — hence value.raw, not value.
          selector: `TemplateElement[value.raw=/${PALETTE_CLASS}/]`,
          message: PALETTE_MESSAGE,
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
