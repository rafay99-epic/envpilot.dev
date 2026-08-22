import chalk from "chalk";
import ora, { type Ora } from "ora";
import { formatRoleLabel, normalizeOrgRole } from "./roles.js";

/**
 * Create a spinner with a message
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: "cyan",
  });
}

/**
 * Run an async operation with a spinner
 */
export async function withSpinner<T>(
  text: string,
  operation: () => Promise<T>,
  options?: {
    successText?: string;
    failText?: string;
  }
): Promise<T> {
  const spinner = createSpinner(text);
  spinner.start();

  try {
    const result = await operation();
    spinner.succeed(options?.successText ?? text);
    return result;
  } catch (error) {
    spinner.fail(options?.failText ?? text);
    throw error;
  }
}

/**
 * Print a success message
 */
export function success(message: string): void {
  console.log(chalk.green("✓"), message);
}

/**
 * Print an info message
 */
export function info(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}

/**
 * Print a warning message
 */
export function warning(message: string): void {
  console.log(chalk.yellow("⚠"), message);
}

/**
 * Print an error message
 */
export function error(message: string): void {
  console.log(chalk.red("✗"), message);
}

/**
 * Print a header
 */
export function header(text: string): void {
  console.log();
  console.log(chalk.bold(text));
  console.log(chalk.dim("─".repeat(text.length)));
}

/**
 * Print a table
 */
export function table(
  data: Array<Record<string, string | number | boolean | undefined>>,
  columns: Array<{ key: string; header: string; width?: number }>
): void {
  if (data.length === 0) {
    console.log(chalk.dim("No data to display"));
    return;
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const headerWidth = col.header.length;
    const maxDataWidth = Math.max(
      ...data.map((row) => String(row[col.key] ?? "").length)
    );
    return col.width ?? Math.max(headerWidth, maxDataWidth);
  });

  // Print header
  const headerLine = columns
    .map((col, i) => col.header.padEnd(widths[i]))
    .join("  ");
  console.log(chalk.bold(headerLine));
  console.log(chalk.dim("─".repeat(headerLine.length)));

  // Print rows
  for (const row of data) {
    const line = columns
      .map((col, i) => String(row[col.key] ?? "").padEnd(widths[i]))
      .join("  ");
    console.log(line);
  }
}

/**
 * Print key-value pairs
 */
export function keyValue(pairs: Array<[string, string | undefined]>): void {
  const maxKeyLength = Math.max(...pairs.map(([key]) => key.length));

  for (const [key, value] of pairs) {
    const paddedKey = key.padEnd(maxKeyLength);
    console.log(`${chalk.dim(paddedKey)}  ${value ?? chalk.dim("(not set)")}`);
  }
}

/**
 * Print a diff view
 */
export function diff(
  added: Record<string, string>,
  removed: Record<string, string>,
  changed: Record<string, { local: string; remote: string }>
): void {
  if (
    Object.keys(added).length === 0 &&
    Object.keys(removed).length === 0 &&
    Object.keys(changed).length === 0
  ) {
    console.log(chalk.dim("No changes"));
    return;
  }

  // Added
  for (const [key, value] of Object.entries(added)) {
    console.log(chalk.green(`+ ${key}=${maskValue(value)}`));
  }

  // Removed
  for (const [key, value] of Object.entries(removed)) {
    console.log(chalk.red(`- ${key}=${maskValue(value)}`));
  }

  // Changed
  for (const [key, { local, remote }] of Object.entries(changed)) {
    console.log(chalk.red(`- ${key}=${maskValue(remote)}`));
    console.log(chalk.green(`+ ${key}=${maskValue(local)}`));
  }
}

/**
 * Mask a sensitive value
 */
export function maskValue(value: string, showChars: number = 4): string {
  if (value.length <= showChars * 2) {
    return "*".repeat(value.length);
  }
  return value.slice(0, showChars) + "****" + value.slice(-showChars);
}

/**
 * Print a horizontal line
 */
export function line(): void {
  console.log(chalk.dim("─".repeat(50)));
}

/**
 * Print blank line
 */
export function blank(): void {
  console.log();
}

/**
 * Format a role name with color. Accepts any legacy or unified role string and
 * renders the unified label (never "Unknown") via roles.ts normalization.
 */
export function formatRole(role: string | null | undefined): string {
  const label = formatRoleLabel(role);
  switch (normalizeOrgRole(role)) {
    case "owner":
      return chalk.green(label);
    case "project_manager":
      return chalk.magenta(label);
    case "team_lead":
      return chalk.blue(label);
    case "developer":
      return chalk.yellow(label);
    default:
      // Custom registry roles (open slug set) — plain label, never crash.
      return label;
  }
}

/**
 * Print a role-based access notice for developers.
 *
 * Under the unified model there are no pending approval requests: a developer
 * simply needs a per-variable write grant to change a value, and an
 * environment-scoped assignment may withhold production entirely.
 */
export function roleNotice(role: string | null | undefined): void {
  if (normalizeOrgRole(role) === "developer") {
    console.log(
      chalk.yellow(
        "  You have Developer access. You can read the variables assigned to you and write only those you hold a write grant for; keys without a grant are skipped, not queued for approval."
      )
    );
  }
}

/**
 * Format a project-level role name with color. Kept for callers that surface a
 * per-project role string; normalizes onto the unified label set.
 */
export function formatProjectRole(role: string | null | undefined): string {
  if (role === undefined || role === null || role === "") {
    return chalk.dim("-");
  }
  return formatRole(role);
}

/**
 * Print an access notice for a developer's project view.
 *
 * Developers read only the variables granted to them; a scoped assignment can
 * also withhold whole environments (e.g. production).
 */
export function projectRoleNotice(role: string | null | undefined): void {
  if (normalizeOrgRole(role) === "developer") {
    console.log(
      chalk.yellow(
        "  You have Developer access to this project. You can only see variables you have been granted, and your assignment may exclude some environments such as production."
      )
    );
  }
}

/**
 * Build picker rows for a project list.
 *
 * The name alone, because `icon` holds an identifier like "framework:t3" and
 * printing it produced rows reading "framework:t3 hello-2". Only slug is
 * unique per organization though, so when two projects share a name the slug
 * is appended dimmed. Without that the picker shows two identical rows and
 * there is no way to tell which one you are choosing.
 */
export function projectChoices<
  T extends { _id: string; name: string; slug?: string },
>(projects: readonly T[]): Array<{ name: string; value: string }> {
  const seen = new Map<string, number>();
  for (const project of projects) {
    const key = project.name || project.slug || project._id;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return projects.map((project) => {
    const label = project.name || project.slug || project._id;
    const ambiguous = (seen.get(label) ?? 0) > 1 && project.slug;
    return {
      name: ambiguous ? `${label} ${chalk.dim(project.slug)}` : label,
      value: project._id,
    };
  });
}
