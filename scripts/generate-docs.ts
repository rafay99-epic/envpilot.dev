#!/usr/bin/env bun
/**
 * generate-docs.ts
 *
 * Reads structured data from the CLI command catalog and the VS Code
 * extension manifest, then writes MDX content files that the docs pages
 * render at build time.
 *
 * Run:   bun run scripts/generate-docs.ts
 * Or:    bun run docs:generate
 *
 * Output:
 *   apps/web/content/docs/cli.mdx
 *   apps/web/content/docs/extension.mdx
 *
 * These files ARE committed to git so the web app never needs to import
 * CLI or extension source at build time.  Re-run this script whenever
 * commands or settings change.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "apps/web/content/docs");

// ─── Helpers ────────────────────────────────────────────────────────────

function write(name: string, content: string) {
  const path = resolve(OUT, `${name}.mdx`);
  writeFileSync(path, content);
  console.log(`  wrote ${path.replace(ROOT + "/", "")}`);
}

function fmtArgv(argv: string[]): string {
  return ["envpilot", ...argv].join(" ").trim();
}

// ─── CLI docs ───────────────────────────────────────────────────────────

interface CLICommand {
  id: string;
  title: string;
  category: string;
  description: string;
  argv: string[];
  args?: string;
  examples: string[][];
  notes: string[];
  topLevel?: boolean;
}

function generateCLIDocs() {
  const catalogPath = resolve(ROOT, "apps/cli/src/lib/command-catalog.ts");
  const source = readFileSync(catalogPath, "utf-8");

  const startMarker = "const COMMAND_CATALOG: CLICommandDefinition[] = [";
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) throw new Error("Cannot find COMMAND_CATALOG in source");

  let depth = 0;
  let arrayStart = -1;
  let arrayEnd = -1;

  for (let i = startIdx + startMarker.length - 1; i < source.length; i++) {
    if (source[i] === "[") {
      if (depth === 0) arrayStart = i;
      depth++;
    } else if (source[i] === "]") {
      depth--;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
  }

  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error("Cannot parse COMMAND_CATALOG array boundaries");
  }

  let raw = source.slice(arrayStart, arrayEnd);
  raw = raw.replace(/createCommand:\s*(?:\(\)\s*=>|)\s*[^,}\n]+,?\n?/g, "");
  raw = raw.replace(/,(\s*[}\]])/g, "$1");

  const catalog: CLICommand[] = new Function(`return ${raw}`)();
  const cliVersion = JSON.parse(
    readFileSync(resolve(ROOT, "apps/cli/package.json"), "utf-8")
  ).version;

  // Group by category
  const categories = new Map<string, CLICommand[]>();
  for (const cmd of catalog) {
    if (!cmd.topLevel) continue;
    const cat = cmd.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(cmd);
  }

  // ── Build the MDX content ──
  const L: string[] = [];
  const push = (...lines: string[]) => L.push(...lines);

  push(
    `---`,
    `title: CLI Tool`,
    `description: Install, authenticate, and manage environment variables from your terminal with the Envpilot CLI.`,
    `icon: terminal`,
    `generatedAt: "${new Date().toISOString()}"`,
    `version: "${cliVersion}"`,
    `---`,
    ``,
    `# CLI Tool`,
    ``,
    `Command reference for [\`@envpilot/cli\`](https://www.npmjs.com/package/@envpilot/cli) v{{version}}. Requires Node.js 18+.`,
    ``,
    `## Install`,
    ``,
    `\`\`\`bash`,
    `npm install -g @envpilot/cli`,
    `\`\`\``,
    ``,
    `Or with bun:`,
    ``,
    `\`\`\`bash`,
    `bun install -g @envpilot/cli`,
    `\`\`\``,
    ``,
    `Or run a single command without installing:`,
    ``,
    `\`\`\`bash`,
    `npx @envpilot/cli login`,
    `\`\`\``,
    ``,
    `## Quick start`,
    ``,
    `\`\`\`bash`,
    `# One-command setup: authenticate, pick a project, pull variables`,
    `envpilot sync`,
    ``,
    `# Or step by step`,
    `envpilot login`,
    `envpilot init`,
    `envpilot pull`,
    `\`\`\``,
    ``,
    `## Interactive TUI`,
    ``,
    `Run \`envpilot\` with no arguments to open the terminal dashboard. Use arrow keys to browse commands, Enter to run, Esc to exit. The TUI returns after each command finishes.`,
    ``,
    `## Output formats`,
    ``,
    `\`envpilot pull\` supports seven export formats:`,
    ``,
    `\`\`\`bash`,
    `envpilot pull                         # .env (default)`,
    `envpilot pull --format json           # JSON`,
    `envpilot pull --format yaml           # YAML`,
    `envpilot pull --format vercel         # Vercel`,
    `envpilot pull --format netlify        # Netlify TOML`,
    `envpilot pull --format aws            # AWS Parameter Store JSON`,
    `envpilot pull --format docker-compose # Docker Compose`,
    `\`\`\``,
    ``,
    `## Push behavior by role`,
    ``,
    `| Role | Behavior |`,
    `| --- | --- |`,
    `| Admin / Team Lead | Push succeeds immediately |`,
    `| Developer | Creates pending requests for approval |`,
    `| Viewer | Blocked with an error |`,
    ``,
    ``
  );

  // ── Auto-generated command reference ──
  push(`## Command reference`, ``);

  for (const [catName, commands] of categories) {
    push(`### ${catName}`, ``);

    for (const cmd of commands) {
      const name = fmtArgv(cmd.argv);
      const fullName = cmd.args ? `${name} ${cmd.args}` : name;

      push(`#### \`${fullName}\``, ``);
      push(cmd.description, ``);

      if (cmd.examples.length > 0) {
        push(`\`\`\`bash`);
        for (const ex of cmd.examples) {
          push(fmtArgv(ex));
        }
        push(`\`\`\``, ``);
      }

      if (cmd.notes.length > 0) {
        for (const note of cmd.notes) {
          push(`> ${note}`, ``);
        }
      }

      push(`---`, ``);
    }
  }

  write("cli", L.join("\n"));
}

// ─── Extension docs ─────────────────────────────────────────────────────

function generateExtensionDocs() {
  const extPkg = JSON.parse(
    readFileSync(resolve(ROOT, "apps/vscode-extension/package.json"), "utf-8")
  );
  const contributes = extPkg.contributes;

  const commands = contributes.commands as Array<{
    command: string;
    title: string;
    category?: string;
  }>;

  const properties = contributes.configuration.properties as Record<
    string,
    {
      type: string;
      default: unknown;
      description: string;
      enum?: string[];
    }
  >;

  const L: string[] = [];
  const push = (...lines: string[]) => L.push(...lines);

  push(
    `---`,
    `title: VS Code Extension`,
    `description: Real-time environment variable sync inside VS Code and Cursor with live revocation, commit guards, and multi-directory support.`,
    `icon: puzzle`,
    `generatedAt: "${new Date().toISOString()}"`,
    `version: "${extPkg.version}"`,
    `---`,
    ``,
    `# VS Code Extension`,
    ``,
    `Envpilot v{{version}} for VS Code and Cursor. Real-time sync, automatic revocation, and commit guards.`,
    ``,
    `## Install`,
    ``,
    `**VS Code** — search for "Envpilot" in the Extensions sidebar, or install directly:`,
    ``,
    `[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=envpilot.envpilot)`,
    ``,
    `**Cursor** — open the Extensions sidebar and search "Envpilot". The same extension works in both editors.`,
    ``,
    `Requires VS Code 1.85+ or Cursor equivalent.`,
    ``,
    `## Authenticate`,
    ``,
    `1. Open the command palette (\`Cmd+Shift+P\` / \`Ctrl+Shift+P\`)`,
    `2. Run **Envpilot: Sign In**`,
    `3. Your browser opens to the Envpilot authentication page`,
    `4. Confirm in the browser — the extension picks up the session automatically`,
    ``,
    `The extension stores your session in VS Code's secure credential storage. To sign out, run **Envpilot: Sign Out**.`,
    ``,
    `## Link a project`,
    ``,
    `1. Run **Envpilot: Link Project** from the command palette`,
    `2. Select your organization and project`,
    `3. Choose which environments to sync (development, staging, production)`,
    `4. Variables are pulled to your configured target file (default: \`.env.local\`)`,
    ``,
    `Once linked, the extension syncs automatically when you open the workspace. The Envpilot sidebar in the Activity Bar shows your linked projects and variables.`,
    ``,
    `## How sync works`,
    ``,
    `- On workspace open, the extension pulls the latest variables and writes them to your target file`,
    `- A background timer checks for permission changes every 5 minutes (configurable)`,
    `- If your access is revoked, the extension detects it via the permission check and **automatically deletes the synced \`.env\` file** to prevent unauthorized access`,
    `- Manual sync: run **Envpilot: Pull Variables** from the command palette`,
    ``,
    `## Commit guard`,
    ``,
    `The extension includes dual-layer protection against committing \`.env\` files:`,
    ``,
    `1. **VS Code staging guard** — warns when you stage a \`.env\` file and offers to unstage it`,
    `2. **Pre-commit hook** — a git hook that blocks commits containing \`.env\` files at the git level`,
    ``,
    `Both are enabled by default. To install or remove the git hook manually:`,
    ``,
    `- **Envpilot: Install Commit Guard Hook**`,
    `- **Envpilot: Remove Commit Guard Hook**`,
    ``,
    `## Multi-directory sync`,
    ``,
    `Link multiple directories in the same workspace to different projects or environments. Each directory syncs independently.`,
    ``,
    `\`\`\``,
    `my-monorepo/`,
    `├── apps/api/.env          ← production`,
    `├── apps/web/.env.local    ← development`,
    `└── packages/sdk/.env      ← staging`,
    `\`\`\``,
    ``,
    `Use **Envpilot: Add Directory** and **Envpilot: Remove Directory** to manage linked paths.`,
    ``,
    `## Requesting a variable`,
    ``,
    `Members who need access to a variable they cannot see can run **Envpilot: Request Variable** from the command palette. This creates a request that a Team Lead or Admin approves from the dashboard.`,
    ``
  );

  // ── Command reference table ──
  push(`## Command reference`, ``);
  push(`| Command | Palette name |`);
  push(`| --- | --- |`);
  for (const cmd of commands) {
    const label = cmd.category ? `${cmd.category}: ${cmd.title}` : cmd.title;
    push(`| \`${cmd.command}\` | ${label} |`);
  }

  // ── Settings reference table ──
  push(``, `## Settings reference`, ``);
  push(`Configure in VS Code Settings (\`Cmd+,\`) under "Envpilot".`, ``);
  push(`| Setting | Type | Default | Description |`);
  push(`| --- | --- | --- | --- |`);

  for (const [key, val] of Object.entries(properties)) {
    if (["envpilot.serverUrl", "envpilot.convexUrl"].includes(key)) continue;
    const def = JSON.stringify(val.default);
    push(`| \`${key}\` | ${val.type} | \`${def}\` | ${val.description} |`);
  }

  push(``);
  write("extension", L.join("\n"));
}

// ─── Main ───────────────────────────────────────────────────────────────

console.log("Generating docs from source...\n");
generateCLIDocs();
generateExtensionDocs();
console.log(
  "\nDone. Hand-written pages: getting-started.mdx, web-dashboard.mdx, security.mdx, rbac.mdx"
);
