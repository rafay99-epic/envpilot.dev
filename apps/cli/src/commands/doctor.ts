import { Command } from "commander";
import chalk from "chalk";
import {
  runDoctor,
  type CheckResult,
  type DoctorReport,
  type Status,
} from "../lib/doctor/checks.js";
import { handleError } from "../lib/errors.js";
import { blank, header } from "../lib/ui.js";

interface DoctorCommandOptions {
  project?: string;
  env?: string;
  json?: boolean;
  fix?: boolean;
  quiet?: boolean;
}

export const doctorCommand = new Command("doctor")
  .description(
    "Diagnose why secrets are not reaching your app. Checks identity, the " +
      "project link, connectivity, the resolved secret set, and the delivery " +
      "path between `envpilot run` and the process that reads the values. " +
      "Only key NAMES are ever printed, never values. The delivery and " +
      "hygiene checks need neither a login nor a network."
  )
  .option(
    "-p, --project <name-or-id>",
    "Linked project to diagnose (defaults to active)"
  )
  .option(
    "-e, --env <environment>",
    "Environment to diagnose (defaults to the linked one)"
  )
  .option("--json", "Emit the report as JSON and nothing else")
  .option(
    "--fix",
    "Apply the unambiguously safe repairs only: add .env / .envpilot to " +
      ".gitignore and tighten the run cache directory to 0700. Never edits " +
      "turbo.json, compose files or package.json."
  )
  .option("-q, --quiet", "Show only warnings and failures")
  .action(async (options: DoctorCommandOptions) => {
    try {
      const report = await runDoctor({
        project: options.project,
        env: options.env,
        fix: options.fix,
        quiet: options.quiet,
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        renderText(report, options.quiet ?? false);
      }

      // Not-signed-in outranks a check failure: the caller needs to know to run
      // `login` rather than to go read the report.
      process.exitCode = !report.authenticated
        ? 2
        : report.summary.failed > 0
          ? 1
          : 0;
    } catch (err) {
      await handleError(err);
    }
  });

const TOKENS: Record<Status, string> = {
  pass: chalk.green("ok".padEnd(4)),
  warn: chalk.yellow("warn"),
  fail: chalk.red("FAIL"),
  skip: chalk.dim("skip"),
};

/** Indent for detail and fix lines: two spaces, a four-wide token, two spaces. */
const DETAIL_INDENT = " ".repeat(8);

function renderText(report: DoctorReport, quiet: boolean): void {
  for (const group of report.groups) {
    const results = quiet
      ? group.results.filter((r) => r.status === "warn" || r.status === "fail")
      : group.results;
    if (results.length === 0) continue;

    header(group.title);
    for (const result of results) renderResult(result);
  }

  if (report.fixesApplied.length > 0) {
    header("Fixed");
    for (const fix of report.fixesApplied) {
      console.log(`  ${chalk.green("+")} ${fix}`);
    }
  }

  const { failed, warnings, passed, skipped } = report.summary;
  const parts = [
    failed > 0 ? chalk.red(`${failed} failed`) : `${failed} failed`,
    warnings > 0
      ? chalk.yellow(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`)
      : `${warnings} warnings`,
    `${passed} passed`,
  ];
  if (skipped > 0) parts.push(chalk.dim(`${skipped} skipped`));

  blank();
  console.log(parts.join(", "));
}

function renderResult(result: CheckResult): void {
  console.log(`  ${TOKENS[result.status]}  ${result.label}`);
  if (result.detail) {
    console.log(chalk.dim(`${DETAIL_INDENT}${result.detail}`));
  }
  if (result.fix) {
    console.log(
      `${DETAIL_INDENT}${chalk.cyan("fix:")} ${chalk.dim(result.fix)}`
    );
  }
}
