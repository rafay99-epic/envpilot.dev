#!/usr/bin/env bun
/**
 * Generate the four reference tables that used to be hand-copied.
 *
 * Every table below has exactly one source of truth in the repo:
 *
 *   cli-commands        apps/cli/src/lib/command-catalog.ts
 *   extension-commands  apps/vscode-extension/package.json (contributes.commands)
 *   extension-settings  apps/vscode-extension/package.json (contributes.configuration)
 *   action-inputs       packages/github-action/action.yml
 *   action-outputs      packages/github-action/action.yml
 *
 * Hand-copying those is how the docs ended up listing two VS Code settings
 * that do not exist and missing three GitHub Action inputs that do. The
 * content pages carry a pair of MDX expression comments, and everything
 * between them is replaced:
 *
 *   generated:cli-commands start ... generated:cli-commands end
 *
 * Usage:
 *   bun scripts/generate-reference.ts          write the blocks
 *   bun scripts/generate-reference.ts --check  fail if any block is stale
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import prettier from "prettier";

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const CONTENT_DIR = resolve(import.meta.dir, "../content");

/**
 * Escape `<` in prose so MDX doesn't read a placeholder like `<id>` as a JSX
 * tag and fail the build. Text already inside backticks is left alone — MDX
 * doesn't parse JSX there, and a backslash would render literally.
 */
function escapeMdx(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/</g, "\\<")))
    .join("");
}

/** Escape a value for a markdown table cell. */
function cell(text: string): string {
  return escapeMdx(text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim());
}

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const rule = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [head, rule, body].join("\n");
}

async function cliCommands(): Promise<string> {
  const catalog = await import(
    join(REPO_ROOT, "apps/cli/src/lib/command-catalog.ts")
  );
  const commands = catalog.getCommandCatalog() as {
    id: string;
    title: string;
    category: string;
    description: string;
    argv: string[];
    args?: string;
    examples: string[][];
    notes: string[];
    aliases?: string[][];
  }[];

  // Quote any argument containing a space — an example like
  // `requests reject <id> --reason use the shared key` is not runnable.
  const format = (argv: string[]) =>
    ["envpilot", ...argv.map((a) => (a.includes(" ") ? `"${a}"` : a))]
      .join(" ")
      .trim();

  const rows = commands.map((command) => {
    const invocation = format(command.argv) || "envpilot";
    const aliases = (command.aliases ?? []).map(format).join(", ");
    return [
      `\`${invocation}\``,
      cell(command.category),
      cell(command.description) + (aliases ? ` Aliases: \`${aliases}\`.` : ""),
    ];
  });

  const details = commands
    .map((command) => {
      const invocation = format(command.argv) || "envpilot";
      const lines = [
        `### \`${invocation}\``,
        "",
        escapeMdx(command.description),
        "",
      ];
      if (command.args) {
        lines.push(`**Arguments** — \`${command.args}\``, "");
      }
      if (command.examples.length > 0) {
        lines.push("```bash");
        for (const example of command.examples) {
          lines.push(format(example) || "envpilot");
        }
        lines.push("```", "");
      }
      if (command.notes.length > 0) {
        lines.push(...command.notes.map((note) => `- ${escapeMdx(note)}`), "");
      }
      return lines.join("\n");
    })
    .join("\n");

  return [
    table(["Command", "Group", "What it does"], rows),
    "",
    "## Command details",
    "",
    details.trimEnd(),
  ].join("\n");
}

interface ExtensionManifest {
  contributes: {
    commands: { command: string; title: string }[];
    configuration: {
      properties: Record<
        string,
        {
          type: string | string[];
          default?: unknown;
          description?: string;
          markdownDescription?: string;
          enum?: string[];
        }
      >;
    };
  };
}

function extensionManifest(): ExtensionManifest {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, "apps/vscode-extension/package.json"), "utf-8")
  ) as ExtensionManifest;
}

function extensionCommands(): string {
  const rows = extensionManifest()
    .contributes.commands // The clipboard-blocked entry is a keybinding trap, not a user command.
    .filter((command) => command.command !== "envpilot.clipboardBlocked")
    .map((command) => [
      `Envpilot: ${cell(command.title)}`,
      `\`${command.command}\``,
    ]);

  return table(["Command palette entry", "Command id"], rows);
}

function extensionSettings(): string {
  const properties = extensionManifest().contributes.configuration.properties;

  const rows = Object.entries(properties).map(([key, schema]) => {
    const type = Array.isArray(schema.type)
      ? schema.type.join(" \\| ")
      : schema.type;
    const fallback = schema.default;
    const shown =
      fallback === undefined || fallback === ""
        ? "—"
        : `\`${JSON.stringify(fallback)}\``;
    const description = cell(
      schema.markdownDescription ?? schema.description ?? ""
    );
    const options = schema.enum
      ? `${/[.!?]$/.test(description) ? "" : "."} Options: ${schema.enum
          .map((o) => `\`${o}\``)
          .join(", ")}.`
      : "";
    return [`\`${key}\``, type, shown, description + options];
  });

  return table(["Setting", "Type", "Default", "What it does"], rows);
}

interface ActionManifest {
  inputs?: Record<
    string,
    { description: string; required?: boolean; default?: string }
  >;
  outputs?: Record<string, { description: string }>;
}

function actionManifest(): ActionManifest {
  const raw = readFileSync(
    join(REPO_ROOT, "packages/github-action/action.yml"),
    "utf-8"
  );
  return Bun.YAML.parse(raw) as ActionManifest;
}

function actionInputs(): string {
  const inputs = actionManifest().inputs ?? {};
  const rows = Object.entries(inputs).map(([name, input]) => [
    `\`${name}\``,
    input.required ? "Yes" : "No",
    input.default === undefined ? "—" : `\`${input.default}\``,
    cell(input.description),
  ]);
  return table(["Input", "Required", "Default", "What it does"], rows);
}

function actionOutputs(): string {
  const outputs = actionManifest().outputs ?? {};
  const rows = Object.entries(outputs).map(([name, output]) => [
    `\`${name}\``,
    cell(output.description),
  ]);
  return table(["Output", "What it holds"], rows);
}

/** Every content file, recursively. */
function contentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return contentFiles(path);
    return entry.name.endsWith(".mdx") ? [path] : [];
  });
}

async function main() {
  const check = process.argv.includes("--check");

  const blocks: Record<string, string> = {
    "cli-commands": await cliCommands(),
    "extension-commands": extensionCommands(),
    "extension-settings": extensionSettings(),
    "action-inputs": actionInputs(),
    "action-outputs": actionOutputs(),
  };

  const stale: string[] = [];
  const written: string[] = [];
  const seen = new Set<string>();

  const prettierConfig = await prettier.resolveConfig(CONTENT_DIR);

  for (const file of contentFiles(CONTENT_DIR)) {
    const original = readFileSync(file, "utf-8");
    let updated = original;
    let touched = false;

    for (const [name, body] of Object.entries(blocks)) {
      // MDX has no HTML comments — the markers are JSX expression comments.
      const pattern = new RegExp(
        `(\\{/\\* generated:${name} start \\*/\\})[\\s\\S]*?(\\{/\\* generated:${name} end \\*/\\})`,
        "g"
      );
      if (!pattern.test(updated)) continue;
      seen.add(name);
      touched = true;
      pattern.lastIndex = 0;
      updated = updated.replace(pattern, `$1\n\n${body}\n\n$2`);
    }

    if (!touched) continue;

    // Format with the repo's own prettier config. Without this the emitted
    // tables are unpadded, `prettier --check` rewrites them, and the very
    // next `--check` run reports drift against a file nobody edited.
    updated = await prettier.format(updated, {
      ...prettierConfig,
      parser: "mdx",
    });

    if (updated === original) continue;
    if (check) stale.push(file);
    else {
      writeFileSync(file, updated);
      written.push(file);
    }
  }

  const missing = Object.keys(blocks).filter((name) => !seen.has(name));
  if (missing.length > 0) {
    console.error(
      `[docs/reference] no page hosts these blocks: ${missing.join(", ")}`
    );
    process.exit(1);
  }

  if (check && stale.length > 0) {
    console.error(
      "[docs/reference] generated tables are stale — run `bun run reference` in apps/docs:\n" +
        stale.map((file) => `  ${file}`).join("\n")
    );
    process.exit(1);
  }

  console.log(
    check
      ? "[docs/reference] all generated tables match their sources"
      : `[docs/reference] wrote ${written.length} file(s)`
  );
}

await main();
