import { Command } from "commander";
import chalk from "chalk";
import {
  error,
  info,
  header,
  keyValue,
  table,
  withSpinner,
  blank,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated, getActiveOrganizationId } from "../lib/config.js";
import { readProjectConfig } from "../lib/project-config.js";
import { notAuthenticated, handleError } from "../lib/errors.js";

/**
 * Format a usage ratio with color coding
 */
function formatUsage(current: number, limit: number | null): string {
  const limitStr = limit === null ? "unlimited" : String(limit);
  const ratio = `${current}/${limitStr}`;

  if (limit === null) return chalk.green(ratio);
  if (current >= limit) return chalk.red(ratio);
  if (current >= limit * 0.8) return chalk.yellow(ratio);
  return chalk.green(ratio);
}

/**
 * Format a feature status
 */
function featureStatus(enabled: boolean): string {
  return enabled ? chalk.green("Enabled") : chalk.dim("Disabled (Pro)");
}

export const usageCommand = new Command("usage")
  .description("Show plan usage and limits for the active organization")
  .option("-o, --organization <id>", "Organization ID")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      const api = createAPIClient();
      const projectConfig = readProjectConfig();

      // Resolve organization ID
      let organizationId =
        options.organization ||
        projectConfig?.organizationId ||
        getActiveOrganizationId();

      // If no org ID found, try to auto-select
      if (!organizationId) {
        const orgs = await withSpinner(
          "Fetching organizations...",
          async () => {
            return api.listOrganizations();
          }
        );

        if (orgs.length === 0) {
          error("No organizations found.");
          process.exit(1);
        }

        if (orgs.length === 1) {
          organizationId = orgs[0]._id;
        } else {
          error(
            "Multiple organizations found. Use --organization to specify one."
          );
          console.log();
          for (const org of orgs) {
            console.log(
              `  ${org.name} (${org.slug}): --organization ${org._id}`
            );
          }
          process.exit(1);
        }
      }

      const usage = await withSpinner("Fetching usage...", () =>
        api.getUsage(organizationId!)
      );

      if (options.json) {
        console.log(JSON.stringify(usage, null, 2));
        return;
      }

      // Plan header
      const tierLabel =
        usage.tier === "pro" ? chalk.green("Pro") : chalk.white("Free");
      header(`Plan: ${tierLabel}`);
      blank();

      if (!usage.enforcementEnabled) {
        info("Pre-alpha mode — all limits are bypassed. Billing coming soon.");
        blank();
      }

      // Resource usage
      header("Resource Usage");
      blank();

      keyValue([
        ["Projects", formatUsage(usage.usage.projects, usage.limits.projects)],
        [
          "Team Members",
          formatUsage(usage.usage.teamMembers, usage.limits.teamMembers),
        ],
        ["Pending Invitations", String(usage.usage.pendingInvitations)],
        ["Total Variables", String(usage.usage.totalVariables)],
      ]);
      blank();

      // Variables per project
      if (usage.usage.variablesPerProject.length > 0) {
        header("Variables per Project");
        blank();

        table(
          usage.usage.variablesPerProject.map((p) => ({
            project: p.projectName,
            variables: formatUsage(p.count, usage.limits.variablesPerProject),
          })),
          [
            { key: "project", header: "Project" },
            { key: "variables", header: "Variables" },
          ]
        );
        blank();
      }

      // Features
      header("Features");
      blank();

      keyValue([
        ["Version History", featureStatus(usage.features.versionHistory)],
        ["Bulk Import", featureStatus(usage.features.bulkImport)],
        [
          "Granular Permissions",
          featureStatus(usage.features.granularPermissions),
        ],
        ["Extension Access", featureStatus(usage.features.extensionAccess)],
        ["Audit Log Retention", `${usage.features.auditLogRetentionDays} days`],
      ]);
      blank();
    } catch (err) {
      await handleError(err);
    }
  });
