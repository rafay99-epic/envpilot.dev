import { Command } from "commander";
import chalk from "chalk";
import {
  error,
  info,
  table,
  header,
  withSpinner,
  maskValue,
  formatRole,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated, getRole } from "../lib/config.js";
import { readProjectConfig } from "../lib/project-config.js";
import { notAuthenticated } from "../lib/errors.js";
import type { Organization, Project, Variable } from "../types/index.js";

export const listCommand = new Command("list")
  .description("List resources")
  .argument(
    "[resource]",
    "Resource type: projects, organizations, variables",
    "projects"
  )
  .option("-o, --organization <id>", "Organization ID (for projects/variables)")
  .option("-p, --project <id>", "Project ID (for variables)")
  .option("-e, --env <environment>", "Environment filter (for variables)")
  .option("--show-values", "Show actual variable values (masked by default)")
  .option("--json", "Output as JSON")
  .action(async (resource, options) => {
    try {
      // Check authentication
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      const api = createAPIClient();
      const projectConfig = readProjectConfig();

      switch (resource) {
        case "orgs":
        case "organizations":
          await listOrganizations(api, options);
          break;

        case "projects":
          await listProjects(api, projectConfig, options);
          break;

        case "vars":
        case "variables":
          await listVariables(api, projectConfig, options);
          break;

        default:
          error(`Unknown resource: ${resource}`);
          console.log();
          console.log("Available resources:");
          console.log("  organizations (orgs)  List your organizations");
          console.log(
            "  projects              List projects in an organization"
          );
          console.log("  variables (vars)      List variables in a project");
          process.exit(1);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : "List failed");
      process.exit(1);
    }
  });

async function listOrganizations(
  api: ReturnType<typeof createAPIClient>,
  options: { json?: boolean }
) {
  const organizations = await withSpinner(
    "Fetching organizations...",
    async () => {
      const response = await api.get<{
        success: boolean;
        data: Organization[];
      }>("/api/cli/organizations");
      return response.data || [];
    }
  );

  if (organizations.length === 0) {
    info("No organizations found.");
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(organizations, null, 2));
    return;
  }

  header("Organizations");
  console.log();

  table(
    organizations.map((org) => ({
      name: org.name,
      slug: org.slug,
      tier: org.tier === "pro" ? chalk.green("Pro") : chalk.dim("Free"),
      role: org.role,
    })),
    [
      { key: "name", header: "Name" },
      { key: "slug", header: "Slug" },
      { key: "tier", header: "Tier" },
      { key: "role", header: "Role" },
    ]
  );
}

async function listProjects(
  api: ReturnType<typeof createAPIClient>,
  projectConfig: ReturnType<typeof readProjectConfig>,
  options: { organization?: string; json?: boolean }
) {
  // Determine organization
  let organizationId = options.organization || projectConfig?.organizationId;

  if (!organizationId) {
    // Fetch organizations and use the first one
    const organizations = await withSpinner(
      "Fetching organizations...",
      async () => {
        const response = await api.get<{
          success: boolean;
          data: Organization[];
        }>("/api/cli/organizations");
        return response.data || [];
      }
    );

    if (organizations.length === 0) {
      info("No organizations found.");
      return;
    }

    if (organizations.length === 1) {
      organizationId = organizations[0]._id;
    } else {
      info("Multiple organizations found. Use --organization to specify one.");
      console.log();
      for (const org of organizations) {
        console.log(`  ${org.name} (${org.slug}): --organization ${org._id}`);
      }
      return;
    }
  }

  const projects = await withSpinner("Fetching projects...", async () => {
    const response = await api.get<{ success: boolean; data: Project[] }>(
      "/api/cli/projects",
      { organizationId: organizationId! }
    );
    return response.data || [];
  });

  if (projects.length === 0) {
    info("No projects found.");
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(projects, null, 2));
    return;
  }

  header("Projects");
  console.log();

  table(
    projects.map((project) => ({
      icon: project.icon || "📦",
      name: project.name,
      slug: project.slug,
      description: project.description || chalk.dim("-"),
      active: projectConfig?.projectId === project._id ? chalk.green("✓") : "",
    })),
    [
      { key: "icon", header: "" },
      { key: "name", header: "Name" },
      { key: "slug", header: "Slug" },
      { key: "description", header: "Description", width: 30 },
      { key: "active", header: "" },
    ]
  );

  const role = getRole();
  if (role) {
    console.log();
    console.log(chalk.dim(`Your role: ${formatRole(role)}`));
  }
}

async function listVariables(
  api: ReturnType<typeof createAPIClient>,
  projectConfig: ReturnType<typeof readProjectConfig>,
  options: {
    project?: string;
    env?: string;
    showValues?: boolean;
    json?: boolean;
  }
) {
  const projectId = options.project || projectConfig?.projectId;
  const environment = options.env || projectConfig?.environment;

  if (!projectId) {
    error("No project specified. Use --project or run `envpilot init` first.");
    process.exit(1);
  }

  const variables = await withSpinner("Fetching variables...", async () => {
    const params: Record<string, string> = { projectId };
    if (environment) {
      params.environment = environment;
    }

    const response = await api.get<{
      success: boolean;
      data: Variable[];
      meta: { total: number; environment: string };
    }>("/api/cli/variables", params);
    return response.data || [];
  });

  if (variables.length === 0) {
    info(`No variables found${environment ? ` for ${environment}` : ""}.`);
    return;
  }

  if (options.json) {
    // For JSON output, optionally mask values
    const output = variables.map((v) => ({
      ...v,
      value: options.showValues ? v.value : maskValue(v.value),
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  header(`Variables${environment ? ` (${environment})` : ""}`);
  console.log();

  table(
    variables.map((variable) => ({
      key: variable.key,
      value: options.showValues ? variable.value : maskValue(variable.value),
      sensitive: variable.isSensitive ? chalk.yellow("●") : "",
      version: `v${variable.version}`,
    })),
    [
      { key: "key", header: "Key" },
      { key: "value", header: "Value", width: 40 },
      { key: "sensitive", header: "" },
      { key: "version", header: "Ver" },
    ]
  );

  console.log();
  console.log(chalk.dim(`Total: ${variables.length} variables`));

  const role = getRole();
  if (role) {
    console.log(chalk.dim(`Your role: ${formatRole(role)}`));
  }

  if (role === "member") {
    console.log(
      chalk.dim("As a Member, you may only see variables you have been granted access to.")
    );
  }

  if (!options.showValues) {
    console.log(chalk.dim("Use --show-values to see actual values"));
  }
}
