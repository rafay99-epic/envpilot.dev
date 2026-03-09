import chalk from "chalk";
import ora, { type Ora } from "ora";

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
  },
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
  columns: Array<{ key: string; header: string; width?: number }>,
): void {
  if (data.length === 0) {
    console.log(chalk.dim("No data to display"));
    return;
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const headerWidth = col.header.length;
    const maxDataWidth = Math.max(
      ...data.map((row) => String(row[col.key] ?? "").length),
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
  changed: Record<string, { local: string; remote: string }>,
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
 * Confirm action with y/n
 */
export function printConfirmPrompt(message: string): void {
  console.log();
  console.log(chalk.yellow(`${message} (y/N)`));
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
