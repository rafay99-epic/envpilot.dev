import { Command } from "commander";
import chalk from "chalk";
import {
  error,
  info,
  table,
  header,
  withSpinner,
  maskValue,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated, getUnifiedRole } from "../lib/config.js";
import { formatRoleLabel } from "../lib/roles.js";
import {
  readProjectConfig,
  readProjectConfigV2,
} from "../lib/project-config.js";
import { getEnvPathForEnvironment } from "../lib/env-file.js";
import { notAuthenticated, handleError } from "../lib/errors.js";
import type { VariablesMeta } from "../types/index.js";

export const listCommand = new Command("list")
  .description("List resources")
  .argument(
    "[resource]",
    "Resource type: projects, organizations, variables, linked",
    "projects"
  )
  .option("-o, --organization <id>", "Organization ID (for projects/variables)")
  .option("-p, --project <id>", "Project ID (for variables)")
  .option("-e, --env <environment>", "Environment filter (for variables)")
  .option("-t, --tag <name>", "Filter by tag name (for variables)")
  .option("--show-values", "Show actual variable values (masked by default)")
  .option("--json", "Output as JSON")
  .action(async (resource, options) => {
    try {
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

        case "linked":
          listLinked();
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
          console.log(
            "  linked                List projects linked in this directory"
          );
          process.exit(1);
      }
    } catch (err) {
      await handleError(err);
    }
  });

function listLinked(): void {
  const configV2 = readProjectConfigV2();
  if (!configV2) {
    info("No projects linked. Run `envpilot init` to get started.");
    return;
  }

  header(`Linked Projects (${configV2.projects.length})`);
  console.log();

  for (const project of configV2.projects) {
    const isActive = project.projectId === configV2.activeProjectId;
    const marker = isActive ? chalk.green("*") : " ";
    const envFile = getEnvPathForEnvironment(project.environment);
    console.log(
      `  ${marker} ${chalk.bold(project.projectName || project.projectId)} ${chalk.dim(`(${project.organizationName || project.organizationId})`)}`
    );
    console.log(`    ${project.environment} ${chalk.dim("→")} ${envFile}`);
    console.log();
  }

  if (configV2.projects.length > 1) {
    console.log(chalk.dim("  (* = active project)"));
    console.log();
    console.log(
      chalk.dim(
        '  Use `envpilot switch --active "<name>"` to change the active project'
      )
    );
  }
}

async function listOrganizations(
  api: ReturnType<typeof createAPIClient>,
  options: { json?: boolean }
) {
  const organizations = await withSpinner(
    "Fetching organizations...",
    async () => {
      return api.listOrganizations();
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
      role: formatRoleLabel(org.unifiedRole ?? org.role),
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
  let organizationId = options.organization || projectConfig?.organizationId;

  if (!organizationId) {
    const organizations = await withSpinner(
      "Fetching organizations...",
      async () => {
        return api.listOrganizations();
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
    return api.listProjects(organizationId!);
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
      role: formatRoleLabel(
        project.unifiedRole ?? project.userRole ?? project.projectRole
      ),
      active: projectConfig?.projectId === project._id ? chalk.green("✓") : "",
    })),
    [
      { key: "icon", header: "" },
      { key: "name", header: "Name" },
      { key: "slug", header: "Slug" },
      { key: "description", header: "Description", width: 30 },
      { key: "role", header: "Role" },
      { key: "active", header: "" },
    ]
  );

  console.log();
  console.log(chalk.dim(`Your org role: ${formatRoleLabel(getUnifiedRole())}`));
}

async function listVariables(
  api: ReturnType<typeof createAPIClient>,
  projectConfig: ReturnType<typeof readProjectConfig>,
  options: {
    project?: string;
    env?: string;
    tag?: string;
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

  let meta: VariablesMeta | undefined;

  const variables = await withSpinner("Fetching variables...", async () => {
    const response = await api.listVariables(projectId, environment);
    meta = response.meta;
    return response.variables;
  });

  // Filter by tag name if specified
  const tagFilter = options.tag?.toLowerCase();
  const filtered = tagFilter
    ? variables.filter((v) =>
        v.tags?.some((t) => t.name.toLowerCase() === tagFilter)
      )
    : variables;

  if (filtered.length === 0) {
    info(
      `No variables found${environment ? ` for ${environment}` : ""}${tagFilter ? ` with tag "${options.tag}"` : ""}.`
    );
    return;
  }

  if (options.json) {
    const output = filtered.map((v) => ({
      ...v,
      value: options.showValues ? v.value : maskValue(v.value),
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  header(
    `Variables${environment ? ` (${environment})` : ""}${tagFilter ? ` [tag: ${options.tag}]` : ""}`
  );
  console.log();

  // Check if any variable has tags to show the column
  const hasTags = filtered.some((v) => v.tags && v.tags.length > 0);

  table(
    filtered.map((variable) => ({
      key: variable.key,
      value: options.showValues ? variable.value : maskValue(variable.value),
      sensitive: variable.isSensitive ? chalk.yellow("●") : "",
      tags: hasTags
        ? variable.tags?.map((t) => t.name).join(", ") || chalk.dim("-")
        : "",
      version:
        typeof variable.version === "number" ? `v${variable.version}` : "",
    })),
    [
      { key: "key", header: "Key" },
      { key: "value", header: "Value", width: 40 },
      { key: "sensitive", header: "" },
      ...(hasTags ? [{ key: "tags", header: "Tags", width: 25 }] : []),
      { key: "version", header: "Ver" },
    ]
  );

  console.log();
  console.log(chalk.dim(`Total: ${filtered.length} variables`));
  console.log(chalk.dim(`Your org role: ${formatRoleLabel(getUnifiedRole())}`));

  if (meta?.scopeRestricted && meta.environmentScope?.length) {
    console.log(
      chalk.dim(
        `Your access is scoped to ${meta.environmentScope.join(", ")}; variables in other environments are withheld.`
      )
    );
  } else if (meta?.grantOnly) {
    console.log(
      chalk.dim("You may only see variables you have been granted access to.")
    );
  }

  if (!options.showValues) {
    console.log(chalk.dim("Use --show-values to see actual values"));
  }
}
