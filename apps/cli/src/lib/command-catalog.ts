import type { Command } from "commander";
import { loginCommand } from "../commands/login.js";
import { initCommand } from "../commands/init.js";
import { pullCommand } from "../commands/pull.js";
import { pushCommand } from "../commands/push.js";
import { switchCommand } from "../commands/switch.js";
import { listCommand } from "../commands/list.js";
import { configCommand } from "../commands/config.js";
import { logoutCommand } from "../commands/logout.js";
import { unlinkCommand } from "../commands/unlink.js";
import { syncCommand } from "../commands/sync.js";
import { usageCommand } from "../commands/usage.js";
import { whoamiCommand } from "../commands/whoami.js";
import { createManCommand } from "../commands/man.js";
import { createUICommand } from "../commands/ui.js";

export type CommandCategory =
  | "Get Started"
  | "Sync"
  | "Browse"
  | "Project"
  | "Account";

export interface CLICommandDefinition {
  id: string;
  title: string;
  category: CommandCategory;
  description: string;
  argv: string[];
  aliases?: string[][];
  args?: string;
  examples: string[][];
  websiteSurface: string;
  notes: string[];
  keywords: string[];
  topLevel?: boolean;
  createCommand?: () => Command;
}

export function formatArgv(argv: string[]): string {
  return ["envpilot", ...argv].join(" ").trim();
}

function matchesArgv(argv: string[], normalized: string): boolean {
  return (
    formatArgv(argv).toLowerCase() === normalized ||
    argv.join(" ").toLowerCase() === normalized
  );
}

const COMMAND_CATALOG: CLICommandDefinition[] = [
  {
    id: "open",
    title: "Open interactive UI",
    category: "Get Started",
    description:
      "Open the Ink-powered terminal dashboard for discovering and running commands.",
    argv: [],
    aliases: [["ui"], ["dashboard"]],
    examples: [[], ["ui"], ["dashboard"]],
    websiteSurface:
      "Terminal-first dashboard aligned with the same auth, project, and variable surfaces as the website.",
    notes: [
      "This is the default when you run `envpilot` with no subcommand.",
      "Supports search, keyboard navigation, and command launch.",
    ],
    keywords: ["dashboard", "tui", "ink", "interactive"],
    topLevel: true,
  },
  {
    id: "ui",
    title: "Interactive UI command",
    category: "Get Started",
    description: "Open the interactive Ink-powered terminal UI.",
    argv: ["ui"],
    aliases: [["dashboard"]],
    examples: [["ui"], ["dashboard"]],
    websiteSurface:
      "First-class parsed command that launches the same Ink dashboard as bare `envpilot`.",
    notes: [
      "Use this when you want the UI explicitly instead of relying on the default no-arg launcher.",
    ],
    keywords: ["dashboard", "tui", "ink"],
    topLevel: true,
    createCommand: createUICommand,
  },
  {
    id: "sync",
    title: "Sync project",
    category: "Sync",
    description:
      "Authenticate, select a project, pull variables, and set up local protection in one flow.",
    argv: ["sync"],
    args: "[--organization <id>] [--project <id>] [--env <environment>]",
    examples: [["sync"], ["sync", "--env", "production"]],
    websiteSurface:
      "Uses the website CLI auth, organizations, projects, and variables endpoints.",
    notes: [
      "Best first-run workflow for local setup.",
      "Reuses the existing login, init, and pull logic under the hood.",
    ],
    keywords: ["login", "auth", "pull", "setup", "bootstrap"],
    topLevel: true,
    createCommand: () => syncCommand,
  },
  {
    id: "man",
    title: "Manual page",
    category: "Get Started",
    description:
      "Show the CLI manual page with commands, workflows, and security guidance.",
    argv: ["man"],
    args: "[command]",
    examples: [["man"], ["man", "pull"]],
    websiteSurface:
      "Documents the implemented CLI surface from the same catalog used by the TUI and command registration.",
    notes: [
      "Use this to see the supported command set.",
      "Supports per-command manual sections.",
    ],
    keywords: ["manual", "docs", "help", "reference"],
    topLevel: true,
    createCommand: () => createManCommand(getTopLevelCommandCatalog()),
  },
  {
    id: "login",
    title: "Login",
    category: "Get Started",
    description: "Authenticate the CLI against the Envpilot web app.",
    argv: ["login"],
    args: "[--api-url <url>] [--no-browser]",
    examples: [["login"], ["login", "--no-browser"]],
    websiteSurface: "Maps to `/api/cli/auth` and the `/cli/auth` browser flow.",
    notes: [
      "Opens the web authentication page by default.",
      "Required before organization or project commands will work.",
    ],
    keywords: ["signin", "authenticate", "browser"],
    topLevel: true,
    createCommand: () => loginCommand,
  },
  {
    id: "init",
    title: "Initialize directory",
    category: "Get Started",
    description:
      "Link the current directory to a project and choose a default environment.",
    argv: ["init"],
    args: "[--organization <id>] [--project <id>] [--env <environment>]",
    examples: [["init"], ["init", "--add"]],
    websiteSurface:
      "Uses website-backed organization and project selection before writing local config.",
    notes: [
      "Creates or updates the local `.envpilot` file.",
      "Supports linking multiple projects with `--add`.",
    ],
    keywords: ["link", "directory", "project", "environment"],
    topLevel: true,
    createCommand: () => initCommand,
  },
  {
    id: "pull",
    title: "Pull variables",
    category: "Sync",
    description:
      "Download project variables into a local file or export format.",
    argv: ["pull"],
    args: "[--env <environment>] [--file <path>] [--format <format>]",
    examples: [["pull"], ["pull", "--env", "staging", "--dry-run"]],
    websiteSurface: "Maps to `/api/cli/variables` for read access.",
    notes: [
      "Supports `.env`, JSON, YAML, Vercel, Netlify, AWS, and Docker Compose formats.",
      "Can pull the active linked project or all linked projects.",
    ],
    keywords: ["download", "export", "variables", "env"],
    topLevel: true,
    createCommand: () => pullCommand,
  },
  {
    id: "push",
    title: "Push variables",
    category: "Sync",
    description:
      "Upload local variables back to Envpilot with approval-aware write behavior.",
    argv: ["push"],
    args: "[--env <environment>] [--file <path>] [--merge|--replace]",
    examples: [["push"], ["push", "--replace"]],
    websiteSurface:
      "Maps to `/api/cli/variables` and `/api/cli/variables/bulk` for writes.",
    notes: [
      "Managers/admins write directly; lower roles create requests for approval.",
      "Compares local and remote variables before applying changes.",
    ],
    keywords: ["upload", "bulk", "merge", "replace"],
    topLevel: true,
    createCommand: () => pushCommand,
  },
  {
    id: "list",
    title: "List resources",
    category: "Browse",
    description:
      "List organizations, projects, variables, or linked projects from the terminal.",
    argv: ["list"],
    args: "[resource]",
    examples: [["list"], ["list", "projects"], ["list", "variables"]],
    websiteSurface:
      "Uses the CLI organizations, projects, and variables endpoints depending on the selected resource.",
    notes: [
      "Default resource is `projects`.",
      "Use `linked` to inspect local `.envpilot` project links.",
    ],
    keywords: ["browse", "organizations", "projects", "variables", "linked"],
    topLevel: true,
    createCommand: () => listCommand,
  },
  {
    id: "list-organizations",
    title: "List organizations",
    category: "Browse",
    description: "List organizations available to the current user.",
    argv: ["list", "organizations"],
    aliases: [["list", "orgs"]],
    examples: [
      ["list", "organizations"],
      ["list", "orgs", "--json"],
    ],
    websiteSurface: "Maps to `/api/cli/organizations`.",
    notes: ["Useful for discovering organization IDs and roles."],
    keywords: ["orgs", "organizations", "roles"],
  },
  {
    id: "list-projects",
    title: "List projects",
    category: "Browse",
    description: "Browse projects in the active organization.",
    argv: ["list", "projects"],
    args: "[--organization <id>] [--json]",
    examples: [
      ["list", "projects"],
      ["list", "projects", "--json"],
    ],
    websiteSurface: "Maps to `/api/cli/projects`.",
    notes: [
      "Shows project roles when available.",
      "Useful for selecting project IDs for automation and scripts.",
    ],
    keywords: ["browse", "projects", "organization"],
  },
  {
    id: "list-variables",
    title: "List variables",
    category: "Browse",
    description:
      "Inspect variables for a project with environment and tag filtering.",
    argv: ["list", "variables"],
    aliases: [["list", "vars"]],
    args: "[--project <id>] [--env <environment>] [--tag <name>]",
    examples: [
      ["list", "variables"],
      ["list", "variables", "--env", "production", "--show-values"],
    ],
    websiteSurface: "Maps to `/api/cli/variables`.",
    notes: [
      "Values are masked by default.",
      "Designed to mirror the web app’s searchable variable surface.",
    ],
    keywords: ["vars", "keys", "filter", "tags"],
  },
  {
    id: "list-linked",
    title: "List linked projects",
    category: "Browse",
    description: "Show projects linked in the current directory.",
    argv: ["list", "linked"],
    examples: [["list", "linked"]],
    websiteSurface: "Local `.envpilot` configuration inspection.",
    notes: ["Shows the active linked project and environment mapping."],
    keywords: ["linked", "local", "project-config"],
  },
  {
    id: "switch",
    title: "Switch active target",
    category: "Project",
    description:
      "Switch the active organization, project, environment, or linked project.",
    argv: ["switch"],
    args: "[--organization <id>] [--project <id>] [--env <environment>] [--active <name-or-id>]",
    examples: [
      ["switch", "--env", "production"],
      ["switch", "--active", "api"],
    ],
    websiteSurface:
      "Works against the same organization/project inventory returned by website APIs.",
    notes: [
      "Updates local CLI state without rewriting the whole project config.",
      "Supports both linked projects and remote project lookup.",
    ],
    keywords: ["active", "target", "environment", "organization"],
    topLevel: true,
    createCommand: () => switchCommand,
  },
  {
    id: "usage",
    title: "Usage and limits",
    category: "Browse",
    description:
      "Inspect current plan usage and feature availability for the active organization.",
    argv: ["usage"],
    args: "[--organization <id>] [--json]",
    examples: [["usage"], ["usage", "--json"]],
    websiteSurface: "Maps to `/api/cli/usage` and `/api/cli/tier`.",
    notes: [
      "Shows project, member, and variable limits.",
      "Useful for CLI feature-gate troubleshooting.",
    ],
    keywords: ["plan", "limits", "billing", "tier"],
    topLevel: true,
    createCommand: () => usageCommand,
  },
  {
    id: "whoami",
    title: "Current identity",
    category: "Account",
    description:
      "Show the authenticated user, API target, and current active CLI context.",
    argv: ["whoami"],
    examples: [["whoami"]],
    websiteSurface:
      "Uses the same website CLI auth identity endpoint exposed to the terminal client.",
    notes: [
      "Validates the current access token against the website.",
      "Useful for debugging stale auth or wrong API URL targets.",
    ],
    keywords: ["user", "identity", "session", "auth"],
    topLevel: true,
    createCommand: () => whoamiCommand,
  },
  {
    id: "config",
    title: "Config",
    category: "Account",
    description:
      "Inspect or update local CLI configuration such as the active API URL.",
    argv: ["config"],
    args: "[list|get|set|path|reset]",
    examples: [["config"], ["config", "path"]],
    websiteSurface:
      "Local-only state for the CLI shell, pointing at the same website backend.",
    notes: [
      "Useful for local development against non-production API URLs.",
      "Shows both global and project-level config paths.",
    ],
    keywords: ["settings", "path", "api", "state"],
    topLevel: true,
    createCommand: () => configCommand,
  },
  {
    id: "logout",
    title: "Logout",
    category: "Account",
    description: "Revoke the current CLI session and clear local auth state.",
    argv: ["logout"],
    examples: [["logout"]],
    websiteSurface: "Maps to `/api/cli/auth?action=revoke`.",
    notes: [
      "Best way to reset a stale CLI session cleanly.",
      "Clears local tokens even if the revoke call fails.",
    ],
    keywords: ["signout", "revoke", "session"],
    topLevel: true,
    createCommand: () => logoutCommand,
  },
  {
    id: "unlink",
    title: "Unlink project",
    category: "Project",
    description:
      "Remove a linked project from the current directory without deleting local env files.",
    argv: ["unlink"],
    args: "[project] [--force]",
    examples: [["unlink"], ["unlink", "api", "--force"]],
    websiteSurface:
      "Local project-link management for website-backed projects.",
    notes: [
      "Updates `.envpilot` and active-project state.",
      "Leaves existing `.env` files on disk.",
    ],
    keywords: ["remove", "disconnect", "local"],
    topLevel: true,
    createCommand: () => unlinkCommand,
  },
];

export function getCommandCatalog(): CLICommandDefinition[] {
  return COMMAND_CATALOG;
}

// Cached once — the catalog is static for the lifetime of the process.
let _topLevelCache: CLICommandDefinition[] | null = null;

export function getTopLevelCommandCatalog(): CLICommandDefinition[] {
  if (!_topLevelCache) {
    _topLevelCache = COMMAND_CATALOG.filter((command) => command.topLevel);
  }
  return _topLevelCache;
}

export const CLI_COMMAND_COUNT = getTopLevelCommandCatalog().length;

export function findCommandDefinition(
  commandIdOrName?: string
): CLICommandDefinition | undefined {
  if (!commandIdOrName) {
    return undefined;
  }

  const normalized = commandIdOrName.trim().toLowerCase();

  return COMMAND_CATALOG.find((command) => {
    if (command.id.toLowerCase() === normalized) {
      return true;
    }

    if (matchesArgv(command.argv, normalized)) {
      return true;
    }

    return command.aliases?.some((alias) => matchesArgv(alias, normalized));
  });
}
