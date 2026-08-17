import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// theme.css deletes the palette, so a raw palette class renders invisible
// rather than erroring. This turns that silence into a message.
const PALETTE_CLASS =
  "\\b(?:bg|text|border|border-[xytrbles]|divide|divide-[xy]|ring|ring-offset|" +
  "outline|placeholder|from|via|to|fill|stroke|shadow|caret|accent|decoration)" +
  "-(?:zinc|slate|gray|neutral|stone|green|emerald|lime|amber|yellow|orange|" +
  "red|rose|blue|sky|indigo|cyan|teal|purple|violet|fuchsia|pink)-\\d{2,3}";

const PALETTE_MESSAGE =
  "Raw palette class. Use a design token (bg-surface, text-ink, border-line, " +
  "text-accent) — see packages/ui/src/theme.css.";

/**
 * The dashboard talks to Convex directly. `/api/*` exists for callers that
 * are NOT the web app: the CLI, the VS Code extension, the GitHub Action, the
 * MCP server and the public REST API.
 *
 * The routes below are the exception, and each one earns it by doing
 * something the browser genuinely cannot:
 *
 *   auth/me, users/sync   read the httpOnly AuthKit cookie
 *   users/me/sessions     revokes WorkOS sessions with the server SDK
 *   checkout, billing/*   Polar redirects and the server-only Polar token
 *   integrations/*        OAuth redirect legs and server-only client secrets
 *   shares/*              mints OTPs and share tokens server-side
 *   doc-shares/*          Node scrypt KDF plus the httpOnly unlock cookie
 *   version, config       polled by signed-out clients
 *
 * Anything else belongs in convex/. A new `fetch("/api/...")` here means a
 * route is being reintroduced, which is the thing this rule exists to catch.
 */
const ALLOWED_API_PREFIXES = [
  "auth/me",
  "users/sync",
  "users/me/sessions",
  "version",
  "config",
  "status",
  "checkout",
  "billing/",
  "integrations/",
  "shares",
  "doc-shares",
  "invitations/",
  "organizations",
  "v1/",
  "mcp",
  "extension/",
];

// esquery terminates a selector's regex literal at the first unescaped "/",
// so every slash in the pattern has to travel as \u002F.
const SLASH = "\\u002F";
const ALLOWED_API_FETCH = ALLOWED_API_PREFIXES.map((p) =>
  p.replaceAll("/", SLASH)
).join("|");

const API_FETCH_MESSAGE =
  "The web app talks to Convex directly — use useQuery/useMutation/useAction " +
  'instead of fetch("/api/..."). /api/* is for the CLI, extension, GitHub ' +
  "Action, MCP and public REST API. See apps/web/eslint.config.mjs.";

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
          // TemplateElement.value is an object — hence value.raw.
          selector: `TemplateElement[value.raw=/${PALETTE_CLASS}/]`,
          message: PALETTE_MESSAGE,
        },
        {
          selector:
            `CallExpression[callee.name="fetch"] > ` +
            `Literal[value=/^${SLASH}api${SLASH}(?!${ALLOWED_API_FETCH})/]`,
          message: API_FETCH_MESSAGE,
        },
        {
          selector:
            `CallExpression[callee.name="fetch"] > TemplateLiteral > ` +
            `TemplateElement[value.raw=/^${SLASH}api${SLASH}(?!${ALLOWED_API_FETCH})/]`,
          message: API_FETCH_MESSAGE,
        },
      ],
    },
  },
  {
    // Route handlers and the API client are the /api layer itself.
    files: ["src/app/api/**", "src/lib/api-client.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  // `.next-*` covers the scratch dirs NEXT_DIST_DIR writes to. ESLint does
  // not read .gitignore, so without this a verification build leaves tens of
  // thousands of lint errors in generated output.
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
