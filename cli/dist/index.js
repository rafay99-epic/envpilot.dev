#!/usr/bin/env node

// src/index.ts
import { Command as Command9 } from "commander";

// src/commands/login.ts
import { Command } from "commander";
import chalk2 from "chalk";
import open from "open";

// src/lib/ui.ts
import chalk from "chalk";
import ora from "ora";
function createSpinner(text) {
  return ora({
    text,
    color: "cyan"
  });
}
async function withSpinner(text, operation, options) {
  const spinner = createSpinner(text);
  spinner.start();
  try {
    const result = await operation();
    spinner.succeed(options?.successText ?? text);
    return result;
  } catch (error2) {
    spinner.fail(options?.failText ?? text);
    throw error2;
  }
}
function success(message) {
  console.log(chalk.green("\u2713"), message);
}
function info(message) {
  console.log(chalk.blue("\u2139"), message);
}
function warning(message) {
  console.log(chalk.yellow("\u26A0"), message);
}
function error(message) {
  console.log(chalk.red("\u2717"), message);
}
function header(text) {
  console.log();
  console.log(chalk.bold(text));
  console.log(chalk.dim("\u2500".repeat(text.length)));
}
function table(data, columns) {
  if (data.length === 0) {
    console.log(chalk.dim("No data to display"));
    return;
  }
  const widths = columns.map((col) => {
    const headerWidth = col.header.length;
    const maxDataWidth = Math.max(
      ...data.map((row) => String(row[col.key] ?? "").length)
    );
    return col.width ?? Math.max(headerWidth, maxDataWidth);
  });
  const headerLine = columns.map((col, i) => col.header.padEnd(widths[i])).join("  ");
  console.log(chalk.bold(headerLine));
  console.log(chalk.dim("\u2500".repeat(headerLine.length)));
  for (const row of data) {
    const line = columns.map((col, i) => String(row[col.key] ?? "").padEnd(widths[i])).join("  ");
    console.log(line);
  }
}
function keyValue(pairs) {
  const maxKeyLength = Math.max(...pairs.map(([key]) => key.length));
  for (const [key, value] of pairs) {
    const paddedKey = key.padEnd(maxKeyLength);
    console.log(`${chalk.dim(paddedKey)}  ${value ?? chalk.dim("(not set)")}`);
  }
}
function diff(added, removed, changed) {
  if (Object.keys(added).length === 0 && Object.keys(removed).length === 0 && Object.keys(changed).length === 0) {
    console.log(chalk.dim("No changes"));
    return;
  }
  for (const [key, value] of Object.entries(added)) {
    console.log(chalk.green(`+ ${key}=${maskValue(value)}`));
  }
  for (const [key, value] of Object.entries(removed)) {
    console.log(chalk.red(`- ${key}=${maskValue(value)}`));
  }
  for (const [key, { local, remote }] of Object.entries(changed)) {
    console.log(chalk.red(`- ${key}=${maskValue(remote)}`));
    console.log(chalk.green(`+ ${key}=${maskValue(local)}`));
  }
}
function maskValue(value, showChars = 4) {
  if (value.length <= showChars * 2) {
    return "*".repeat(value.length);
  }
  return value.slice(0, showChars) + "****" + value.slice(-showChars);
}

// src/lib/config.ts
import Conf from "conf";
var DEFAULT_API_URL = "http://localhost:3000";
var config = new Conf({
  projectName: "env-connect",
  defaults: {
    apiUrl: DEFAULT_API_URL
  }
});
function getConfig() {
  return {
    apiUrl: config.get("apiUrl") ?? DEFAULT_API_URL,
    accessToken: config.get("accessToken"),
    refreshToken: config.get("refreshToken"),
    activeProjectId: config.get("activeProjectId"),
    activeOrganizationId: config.get("activeOrganizationId"),
    user: config.get("user")
  };
}
function getApiUrl() {
  return config.get("apiUrl") ?? DEFAULT_API_URL;
}
function setApiUrl(url) {
  config.set("apiUrl", url);
}
function getAccessToken() {
  return config.get("accessToken");
}
function setAccessToken(token) {
  config.set("accessToken", token);
}
function setRefreshToken(token) {
  config.set("refreshToken", token);
}
function setActiveProjectId(projectId) {
  config.set("activeProjectId", projectId);
}
function setActiveOrganizationId(organizationId) {
  config.set("activeOrganizationId", organizationId);
}
function getUser() {
  return config.get("user");
}
function setUser(user) {
  config.set("user", user);
}
function isAuthenticated() {
  return !!config.get("accessToken");
}
function clearAuth() {
  config.delete("accessToken");
  config.delete("refreshToken");
  config.delete("user");
}
function clearConfig() {
  config.clear();
}
function getConfigPath() {
  return config.path;
}

// src/lib/api.ts
var APIError = class extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "APIError";
  }
};
var APIClient = class {
  baseUrl;
  accessToken;
  constructor(options) {
    this.baseUrl = options?.baseUrl ?? getApiUrl();
    this.accessToken = options?.accessToken ?? getAccessToken();
  }
  /**
   * Get headers for API requests
   */
  getHeaders() {
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }
  /**
   * Make a GET request
   */
  async get(path, params) {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders()
    });
    return this.handleResponse(response);
  }
  /**
   * Make a POST request
   */
  async post(path, body) {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : void 0
    });
    return this.handleResponse(response);
  }
  /**
   * Make a PUT request
   */
  async put(path, body) {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "PUT",
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : void 0
    });
    return this.handleResponse(response);
  }
  /**
   * Make a PATCH request
   */
  async patch(path, body) {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "PATCH",
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : void 0
    });
    return this.handleResponse(response);
  }
  /**
   * Make a DELETE request
   */
  async delete(path) {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers: this.getHeaders()
    });
    if (!response.ok) {
      await this.handleError(response);
    }
  }
  /**
   * Handle API response
   */
  async handleResponse(response) {
    if (!response.ok) {
      await this.handleError(response);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const body2 = await response.text();
      const preview = body2.replace(/\s+/g, " ").slice(0, 160);
      throw new APIError(
        `Expected JSON but got ${contentType || "unknown content type"} from ${response.url}. Response starts with: ${preview}`,
        response.status || 500
      );
    }
    const body = await response.text();
    try {
      const data = JSON.parse(body);
      return data;
    } catch {
      const preview = body.replace(/\s+/g, " ").slice(0, 160);
      throw new APIError(
        `Failed to parse JSON response from ${response.url}. Response starts with: ${preview}`,
        response.status || 500
      );
    }
  }
  /**
   * Handle API errors
   */
  async handleError(response) {
    let message = `Request failed with status ${response.status}`;
    let code;
    try {
      const data = await response.json();
      message = data.error || data.message || message;
      code = data.code;
    } catch {
    }
    if (response.status === 401) {
      clearAuth();
      throw new APIError("Authentication required. Please run `env-connect login`.", 401, "UNAUTHORIZED");
    }
    if (response.status === 403) {
      throw new APIError(message || "Access denied.", 403, code || "FORBIDDEN");
    }
    if (response.status === 402) {
      throw new APIError(message || "Payment is currently disabled for this pre-alpha build.", 402, "PAYMENT_REQUIRED");
    }
    throw new APIError(message, response.status, code);
  }
  // ============================================
  // High-level API methods
  // ============================================
  /**
   * Get current user info
   */
  async getCurrentUser() {
    return this.get("/api/cli/auth/me");
  }
  /**
   * Get tier info for the active organization
   */
  async getTierInfo(organizationId) {
    return this.get("/api/cli/tier", { organizationId });
  }
  /**
   * List organizations the user has access to
   */
  async listOrganizations() {
    const response = await this.get("/api/cli/organizations");
    return response.data || [];
  }
  /**
   * List projects in an organization
   */
  async listProjects(organizationId) {
    const response = await this.get("/api/cli/projects", { organizationId });
    return response.data || [];
  }
  /**
   * Get a project by ID
   */
  async getProject(projectId) {
    return this.get(`/api/cli/projects/${projectId}`);
  }
  /**
   * List variables in a project
   */
  async listVariables(projectId, environment) {
    const params = { projectId };
    if (environment) {
      params.environment = environment;
    }
    const response = await this.get("/api/cli/variables", params);
    return response.data || [];
  }
  /**
   * Get a variable by ID (with decrypted value)
   */
  async getVariable(variableId) {
    return this.get(`/api/cli/variables/${variableId}`);
  }
  /**
   * Create a new variable
   */
  async createVariable(data) {
    return this.post("/api/cli/variables", data);
  }
  /**
   * Update a variable
   */
  async updateVariable(variableId, data) {
    return this.patch(`/api/cli/variables/${variableId}`, data);
  }
  /**
   * Delete a variable
   */
  async deleteVariable(variableId) {
    return this.delete(`/api/cli/variables/${variableId}`);
  }
  /**
   * Bulk create/update variables
   */
  async bulkUpsertVariables(data) {
    return this.post("/api/cli/variables/bulk", data);
  }
  // ============================================
  // Authentication methods
  // ============================================
  /**
   * Initiate CLI authentication flow
   */
  async initiateAuth(deviceName) {
    return this.post("/api/cli/auth/initiate", { deviceName });
  }
  /**
   * Poll for authentication status
   */
  async pollAuth(code) {
    return this.get("/api/cli/auth/poll", { code });
  }
  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    return this.post("/api/cli/auth/refresh", { refreshToken });
  }
  /**
   * Revoke access token (logout)
   */
  async revokeToken() {
    return this.post("/api/cli/auth/revoke", {});
  }
};
function createAPIClient() {
  return new APIClient();
}

// src/commands/login.ts
import { hostname } from "os";
var POLL_INTERVAL_MS = 2e3;
var MAX_POLL_ATTEMPTS = 150;
var loginCommand = new Command("login").description("Authenticate with ENV Connect").option("--api-url <url>", "API URL (default: http://localhost:3000)").option("--no-browser", "Do not automatically open the browser").action(async (options) => {
  try {
    if (options.apiUrl) {
      setApiUrl(options.apiUrl);
    }
    const api = createAPIClient();
    const deviceName = `CLI - ${hostname()}`;
    info("Starting authentication flow...");
    const spinner = createSpinner("Generating authentication code...");
    spinner.start();
    const initResponse = await api.post("/api/cli/auth?action=initiate", { deviceName });
    spinner.stop();
    console.log();
    console.log(chalk2.bold("Your authentication code:"));
    console.log();
    console.log(chalk2.cyan.bold(`    ${initResponse.code}`));
    console.log();
    console.log(`Open this URL to authenticate:`);
    console.log(chalk2.dim(initResponse.url));
    console.log();
    if (options.browser !== false) {
      info("Opening browser...");
      await open(initResponse.url);
    }
    const pollSpinner = createSpinner("Waiting for authentication...");
    pollSpinner.start();
    let authenticated = false;
    let attempts = 0;
    while (!authenticated && attempts < MAX_POLL_ATTEMPTS) {
      await sleep(POLL_INTERVAL_MS);
      const pollResponse = await api.get("/api/cli/auth", { action: "poll", code: initResponse.code });
      if (pollResponse.status === "authenticated") {
        pollSpinner.stop();
        if (pollResponse.accessToken) {
          setAccessToken(pollResponse.accessToken);
        }
        if (pollResponse.refreshToken) {
          setRefreshToken(pollResponse.refreshToken);
        }
        if (pollResponse.user) {
          setUser({
            id: pollResponse.user.id,
            email: pollResponse.user.email,
            name: pollResponse.user.name
          });
        }
        authenticated = true;
        console.log();
        success(`Logged in as ${chalk2.bold(pollResponse.user?.email)}`);
        console.log();
        console.log("Next steps:");
        console.log(`  ${chalk2.cyan("env-connect init")}     Initialize a project in the current directory`);
        console.log(`  ${chalk2.cyan("env-connect list")}     List your projects and organizations`);
        console.log();
        break;
      }
      if (pollResponse.status === "expired" || pollResponse.status === "not_found") {
        pollSpinner.stop();
        error("Authentication code expired. Please try again.");
        process.exit(1);
      }
      attempts++;
    }
    if (!authenticated) {
      pollSpinner.stop();
      error("Authentication timed out. Please try again.");
      process.exit(1);
    }
  } catch (err) {
    error(err instanceof Error ? err.message : "Authentication failed");
    process.exit(1);
  }
});
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/commands/init.ts
import { Command as Command2 } from "commander";
import chalk4 from "chalk";
import inquirer from "inquirer";

// src/lib/project-config.ts
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";

// src/types/index.ts
import { z } from "zod";
var userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional()
});
var organizationSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  tier: z.enum(["free", "pro"])
});
var projectSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  organizationId: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional()
});
var variableSchema = z.object({
  _id: z.string(),
  key: z.string(),
  value: z.string(),
  environment: z.enum(["development", "staging", "production"]),
  projectId: z.string(),
  description: z.string().optional(),
  isSensitive: z.boolean().optional()
});
var environmentSchema = z.enum(["development", "staging", "production"]);
var cliConfigSchema = z.object({
  apiUrl: z.string().url(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  activeProjectId: z.string().optional(),
  activeOrganizationId: z.string().optional(),
  user: userSchema.optional()
});
var projectConfigSchema = z.object({
  projectId: z.string(),
  organizationId: z.string(),
  environment: environmentSchema.default("development")
});

// src/lib/project-config.ts
var CONFIG_FILE_NAME = ".envconnect";
function getProjectConfigPath(directory = process.cwd()) {
  return join(directory, CONFIG_FILE_NAME);
}
function hasProjectConfig(directory = process.cwd()) {
  return existsSync(getProjectConfigPath(directory));
}
function readProjectConfig(directory = process.cwd()) {
  const configPath = getProjectConfigPath(directory);
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content);
    return projectConfigSchema.parse(parsed);
  } catch {
    return null;
  }
}
function writeProjectConfig(config2, directory = process.cwd()) {
  const configPath = getProjectConfigPath(directory);
  const content = JSON.stringify(config2, null, 2) + "\n";
  writeFileSync(configPath, content, "utf-8");
}
function updateProjectConfig(updates, directory = process.cwd()) {
  const existing = readProjectConfig(directory);
  if (!existing) {
    throw new Error("No project config found. Run `env-connect init` first.");
  }
  const updated = { ...existing, ...updates };
  writeProjectConfig(updated, directory);
}
function ensureEnvInGitignore(directory = process.cwd()) {
  const gitignorePath = join(directory, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, ".env\n.env.local\n", "utf-8");
    return;
  }
  const content = readFileSync(gitignorePath, "utf-8");
  const lines = content.split("\n");
  if (lines.some((line) => line.trim() === ".env")) {
    return;
  }
  const newContent = content.endsWith("\n") ? content + ".env\n" : content + "\n.env\n";
  writeFileSync(gitignorePath, newContent, "utf-8");
}

// src/lib/errors.ts
import chalk3 from "chalk";
var CLIError = class extends Error {
  constructor(message, code, suggestion) {
    super(message);
    this.code = code;
    this.suggestion = suggestion;
    this.name = "CLIError";
  }
};
var ErrorCodes = {
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  NOT_INITIALIZED: "NOT_INITIALIZED",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  ORGANIZATION_NOT_FOUND: "ORGANIZATION_NOT_FOUND",
  VARIABLE_NOT_FOUND: "VARIABLE_NOT_FOUND",
  INVALID_CONFIG: "INVALID_CONFIG",
  NETWORK_ERROR: "NETWORK_ERROR",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  TIER_LIMIT_EXCEEDED: "TIER_LIMIT_EXCEEDED",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  UNKNOWN_ERROR: "UNKNOWN_ERROR"
};
function notAuthenticated() {
  return new CLIError(
    "You are not authenticated.",
    ErrorCodes.NOT_AUTHENTICATED,
    "Run `env-connect login` to authenticate."
  );
}
function notInitialized() {
  return new CLIError(
    "This directory is not initialized with ENV Connect.",
    ErrorCodes.NOT_INITIALIZED,
    "Run `env-connect init` to initialize."
  );
}
function fileNotFound(path) {
  return new CLIError(
    `File not found: ${path}`,
    ErrorCodes.FILE_NOT_FOUND
  );
}

// src/commands/init.ts
var initCommand = new Command2("init").description("Initialize ENV Connect in the current directory").option("-o, --organization <id>", "Organization ID").option("-p, --project <id>", "Project ID").option("-e, --environment <env>", "Default environment (development, staging, production)").option("-f, --force", "Overwrite existing configuration").action(async (options) => {
  try {
    if (!isAuthenticated()) {
      throw notAuthenticated();
    }
    if (hasProjectConfig() && !options.force) {
      warning("This directory is already initialized with ENV Connect.");
      const { proceed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: "Do you want to reinitialize?",
          default: false
        }
      ]);
      if (!proceed) {
        info("Initialization cancelled.");
        return;
      }
    }
    const api = createAPIClient();
    const organizations = await withSpinner(
      "Fetching organizations...",
      async () => {
        const response = await api.get(
          "/api/cli/organizations"
        );
        return response.data || [];
      }
    );
    if (organizations.length === 0) {
      error("No organizations found. Please create an organization first.");
      process.exit(1);
    }
    let selectedOrg;
    if (options.organization) {
      const org = organizations.find(
        (o) => o._id === options.organization || o.slug === options.organization
      );
      if (!org) {
        error(`Organization not found: ${options.organization}`);
        process.exit(1);
      }
      selectedOrg = org;
    } else if (organizations.length === 1) {
      selectedOrg = organizations[0];
      info(`Using organization: ${chalk4.bold(selectedOrg.name)}`);
    } else {
      const { orgId } = await inquirer.prompt([
        {
          type: "list",
          name: "orgId",
          message: "Select an organization:",
          choices: organizations.map((org) => ({
            name: `${org.name} ${org.tier === "pro" ? chalk4.green("(Pro)") : chalk4.dim("(Free)")}`,
            value: org._id
          }))
        }
      ]);
      selectedOrg = organizations.find((o) => o._id === orgId);
    }
    const projects = await withSpinner(
      "Fetching projects...",
      async () => {
        const response = await api.get(
          "/api/cli/projects",
          { organizationId: selectedOrg._id }
        );
        return response.data || [];
      }
    );
    if (projects.length === 0) {
      error("No projects found. Please create a project first.");
      process.exit(1);
    }
    let selectedProject;
    if (options.project) {
      const project = projects.find(
        (p) => p._id === options.project || p.slug === options.project
      );
      if (!project) {
        error(`Project not found: ${options.project}`);
        process.exit(1);
      }
      selectedProject = project;
    } else if (projects.length === 1) {
      selectedProject = projects[0];
      info(`Using project: ${chalk4.bold(selectedProject.name)}`);
    } else {
      const { projectId } = await inquirer.prompt([
        {
          type: "list",
          name: "projectId",
          message: "Select a project:",
          choices: projects.map((project) => ({
            name: `${project.icon || "\u{1F4E6}"} ${project.name}`,
            value: project._id
          }))
        }
      ]);
      selectedProject = projects.find((p) => p._id === projectId);
    }
    let selectedEnvironment = "development";
    if (options.environment) {
      if (!["development", "staging", "production"].includes(options.environment)) {
        error("Invalid environment. Must be: development, staging, or production");
        process.exit(1);
      }
      selectedEnvironment = options.environment;
    } else {
      const { environment } = await inquirer.prompt([
        {
          type: "list",
          name: "environment",
          message: "Select default environment:",
          choices: [
            { name: "Development", value: "development" },
            { name: "Staging", value: "staging" },
            { name: "Production", value: "production" }
          ],
          default: "development"
        }
      ]);
      selectedEnvironment = environment;
    }
    writeProjectConfig({
      projectId: selectedProject._id,
      organizationId: selectedOrg._id,
      environment: selectedEnvironment
    });
    setActiveOrganizationId(selectedOrg._id);
    setActiveProjectId(selectedProject._id);
    ensureEnvInGitignore();
    console.log();
    success("Project initialized!");
    console.log();
    console.log(chalk4.dim("Configuration saved to .envconnect"));
    console.log();
    console.log("Next steps:");
    console.log(`  ${chalk4.cyan("env-connect pull")}     Download environment variables`);
    console.log(`  ${chalk4.cyan("env-connect push")}     Upload local .env to cloud`);
    console.log();
  } catch (err) {
    error(err instanceof Error ? err.message : "Initialization failed");
    process.exit(1);
  }
});

// src/commands/pull.ts
import { Command as Command3 } from "commander";
import chalk5 from "chalk";
import inquirer2 from "inquirer";

// src/lib/env-file.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2 } from "fs";
import { join as join2 } from "path";
function parseEnvFile(content) {
  const result = {};
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.substring(0, equalsIndex).trim();
    let value = line.substring(equalsIndex + 1);
    value = parseValue(value);
    if (isValidEnvKey(key)) {
      result[key] = value;
    }
  }
  return result;
}
function parseValue(value) {
  value = value.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
    value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "	").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  } else if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  } else {
    const commentIndex = value.indexOf(" #");
    if (commentIndex !== -1) {
      value = value.substring(0, commentIndex).trim();
    }
  }
  return value;
}
function isValidEnvKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}
function stringifyEnv(vars, options) {
  let keys = Object.keys(vars);
  if (options?.sort) {
    keys = keys.sort();
  }
  const lines = [];
  for (const key of keys) {
    const value = vars[key];
    if (options?.comments?.[key]) {
      lines.push(`# ${options.comments[key]}`);
    }
    const formattedValue = formatValue(value);
    lines.push(`${key}=${formattedValue}`);
  }
  return lines.join("\n") + "\n";
}
function formatValue(value) {
  const needsQuotes = value.includes("\n") || value.includes("\r") || value.includes('"') || value.includes("'") || value.includes(" ") || value.includes("#") || value.startsWith(" ") || value.endsWith(" ");
  if (!needsQuotes) {
    return value;
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  return `"${escaped}"`;
}
function diffEnvVars(local, remote) {
  const added = {};
  const removed = {};
  const changed = {};
  const unchanged = [];
  for (const [key, value] of Object.entries(local)) {
    if (!(key in remote)) {
      added[key] = value;
    } else if (remote[key] !== value) {
      changed[key] = { local: value, remote: remote[key] };
    } else {
      unchanged.push(key);
    }
  }
  for (const [key, value] of Object.entries(remote)) {
    if (!(key in local)) {
      removed[key] = value;
    }
  }
  return { added, removed, changed, unchanged };
}
function readEnvFile(filePath) {
  if (!existsSync2(filePath)) {
    return null;
  }
  const content = readFileSync2(filePath, "utf-8");
  return parseEnvFile(content);
}
function writeEnvFile(filePath, vars, options) {
  const content = stringifyEnv(vars, options);
  writeFileSync2(filePath, content, "utf-8");
}
function getEnvPathForEnvironment(environment, directory = process.cwd()) {
  if (environment === "development") {
    return join2(directory, ".env");
  }
  return join2(directory, `.env.${environment}`);
}

// src/commands/pull.ts
var pullCommand = new Command3("pull").description("Download environment variables to local .env file").option("-e, --env <environment>", "Environment (development, staging, production)").option("-f, --file <path>", "Output file path (default: .env)").option("--force", "Overwrite without confirmation").option("--format <format>", "Output format: env, json", "env").option("--dry-run", "Show what would be downloaded without writing").action(async (options) => {
  try {
    if (!isAuthenticated()) {
      throw notAuthenticated();
    }
    const projectConfig = readProjectConfig();
    if (!projectConfig) {
      throw notInitialized();
    }
    const environment = options.env || projectConfig.environment || "development";
    const outputPath = options.file || getEnvPathForEnvironment(environment);
    const api = createAPIClient();
    const variables = await withSpinner(
      `Fetching ${chalk5.bold(environment)} variables...`,
      async () => {
        const response = await api.get("/api/cli/variables", {
          projectId: projectConfig.projectId,
          environment
        });
        return response.data || [];
      }
    );
    if (variables.length === 0) {
      warning(`No variables found for ${environment} environment.`);
      return;
    }
    const remoteVars = {};
    for (const variable of variables) {
      remoteVars[variable.key] = variable.value;
    }
    const localVars = readEnvFile(outputPath) || {};
    const diffResult = diffEnvVars(remoteVars, localVars);
    const hasChanges = Object.keys(diffResult.added).length > 0 || Object.keys(diffResult.removed).length > 0 || Object.keys(diffResult.changed).length > 0;
    if (!hasChanges) {
      success("Local file is up to date.");
      return;
    }
    console.log();
    console.log(chalk5.bold("Changes:"));
    console.log();
    diff(diffResult.added, diffResult.removed, diffResult.changed);
    console.log();
    if (options.dryRun) {
      info("Dry run - no changes written.");
      return;
    }
    if (!options.force && Object.keys(localVars).length > 0) {
      const { proceed } = await inquirer2.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: `Overwrite ${outputPath}?`,
          default: true
        }
      ]);
      if (!proceed) {
        info("Pull cancelled.");
        return;
      }
    }
    if (options.format === "json") {
      const fs = await import("fs");
      fs.writeFileSync(outputPath, JSON.stringify(remoteVars, null, 2) + "\n");
    } else {
      const comments = {};
      for (const variable of variables) {
        if (variable.description) {
          comments[variable.key] = variable.description;
        }
      }
      writeEnvFile(outputPath, remoteVars, { sort: true, comments });
    }
    success(`Downloaded ${variables.length} variables to ${chalk5.bold(outputPath)}`);
    console.log();
    console.log(chalk5.dim(`  Added:   ${Object.keys(diffResult.added).length}`));
    console.log(chalk5.dim(`  Changed: ${Object.keys(diffResult.changed).length}`));
    console.log(chalk5.dim(`  Removed: ${Object.keys(diffResult.removed).length}`));
  } catch (err) {
    error(err instanceof Error ? err.message : "Pull failed");
    process.exit(1);
  }
});

// src/commands/push.ts
import { Command as Command4 } from "commander";
import chalk6 from "chalk";
import inquirer3 from "inquirer";

// src/lib/validators.ts
import { z as z2 } from "zod";
var envKeySchema = z2.string().min(1, "Key cannot be empty").max(256, "Key cannot exceed 256 characters").regex(
  /^[A-Za-z_][A-Za-z0-9_]*$/,
  "Key must start with a letter or underscore, followed by letters, numbers, or underscores"
);
var envValueSchema = z2.string().max(65536, "Value cannot exceed 64KB");
var environmentSchema2 = z2.enum(["development", "staging", "production"]);
var projectSlugSchema = z2.string().min(1, "Slug cannot be empty").max(128, "Slug cannot exceed 128 characters").regex(
  /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
  "Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen"
);
var urlSchema = z2.string().url("Must be a valid URL");
var tokenSchema = z2.string().min(1, "Token cannot be empty").regex(/^env_[A-Za-z0-9]{48}$/, "Invalid token format");
var filePathSchema = z2.string().min(1, "File path cannot be empty");
function validateEnvVars(vars) {
  const valid = {};
  const invalid = [];
  for (const [key, value] of Object.entries(vars)) {
    const keyResult = envKeySchema.safeParse(key);
    const valueResult = envValueSchema.safeParse(value);
    if (!keyResult.success) {
      invalid.push({ key, error: keyResult.error.errors[0].message });
      continue;
    }
    if (!valueResult.success) {
      invalid.push({ key, error: valueResult.error.errors[0].message });
      continue;
    }
    valid[key] = value;
  }
  return { valid, invalid };
}

// src/commands/push.ts
var pushCommand = new Command4("push").description("Upload local .env file to cloud").option("-e, --env <environment>", "Target environment (development, staging, production)").option("-f, --file <path>", "Input file path (default: .env)").option("--merge", "Merge with existing variables (default)").option("--replace", "Replace all existing variables").option("--dry-run", "Show what would be uploaded without making changes").option("--force", "Skip confirmation").action(async (options) => {
  try {
    if (!isAuthenticated()) {
      throw notAuthenticated();
    }
    const projectConfig = readProjectConfig();
    if (!projectConfig) {
      throw notInitialized();
    }
    const environment = options.env || projectConfig.environment || "development";
    const inputPath = options.file || getEnvPathForEnvironment(environment);
    const mode = options.replace ? "replace" : "merge";
    const localVars = readEnvFile(inputPath);
    if (!localVars) {
      throw fileNotFound(inputPath);
    }
    if (Object.keys(localVars).length === 0) {
      warning(`No variables found in ${inputPath}`);
      return;
    }
    const { valid, invalid } = validateEnvVars(localVars);
    if (invalid.length > 0) {
      warning("Some variables have invalid keys and will be skipped:");
      for (const { key, error: err } of invalid) {
        console.log(chalk6.red(`  ${key}: ${err}`));
      }
      console.log();
    }
    if (Object.keys(valid).length === 0) {
      error("No valid variables to push.");
      return;
    }
    const api = createAPIClient();
    const remoteVariables = await withSpinner(
      "Fetching current variables...",
      async () => {
        const response = await api.get("/api/cli/variables", {
          projectId: projectConfig.projectId,
          environment
        });
        return response.data || [];
      }
    );
    const remoteVars = {};
    for (const variable of remoteVariables) {
      remoteVars[variable.key] = variable.value;
    }
    const diffResult = diffEnvVars(valid, remoteVars);
    const hasChanges = Object.keys(diffResult.added).length > 0 || Object.keys(diffResult.changed).length > 0 || mode === "replace" && Object.keys(diffResult.removed).length > 0;
    if (!hasChanges) {
      success("Remote is up to date.");
      return;
    }
    console.log();
    console.log(chalk6.bold("Changes to push:"));
    console.log();
    const removedToShow = mode === "replace" ? diffResult.removed : {};
    diff(diffResult.added, removedToShow, diffResult.changed);
    if (mode === "merge" && Object.keys(diffResult.removed).length > 0) {
      console.log();
      console.log(chalk6.dim(`Note: ${Object.keys(diffResult.removed).length} remote variables not in local file will be preserved (use --replace to remove them)`));
    }
    console.log();
    if (options.dryRun) {
      info("Dry run - no changes made.");
      console.log();
      console.log("Summary:");
      console.log(`  Would add:    ${Object.keys(diffResult.added).length}`);
      console.log(`  Would update: ${Object.keys(diffResult.changed).length}`);
      if (mode === "replace") {
        console.log(`  Would delete: ${Object.keys(diffResult.removed).length}`);
      }
      return;
    }
    if (!options.force) {
      const confirmMessage = mode === "replace" ? `Push ${Object.keys(valid).length} variables and delete ${Object.keys(diffResult.removed).length} remote-only variables?` : `Push ${Object.keys(valid).length} variables to ${environment}?`;
      const { proceed } = await inquirer3.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: confirmMessage,
          default: true
        }
      ]);
      if (!proceed) {
        info("Push cancelled.");
        return;
      }
    }
    const result = await withSpinner(
      `Pushing variables to ${chalk6.bold(environment)}...`,
      async () => {
        const response = await api.post("/api/cli/variables/bulk", {
          projectId: projectConfig.projectId,
          environment,
          variables: Object.entries(valid).map(([key, value]) => ({
            key,
            value
          })),
          mode
        });
        return response.data;
      }
    );
    if (result?.requested && result.requested > 0) {
      success(
        `Submitted ${result.requested} variable request(s) for ${chalk6.bold(environment)}`
      );
    } else {
      success(`Pushed ${result?.total || Object.keys(valid).length} variables to ${chalk6.bold(environment)}`);
    }
    console.log();
    console.log(chalk6.dim(`  Created: ${result?.created || 0}`));
    console.log(chalk6.dim(`  Updated: ${result?.updated || 0}`));
    if (result?.requested) {
      console.log(chalk6.dim(`  Requested: ${result.requested}`));
    }
    if (mode === "replace") {
      console.log(chalk6.dim(`  Deleted: ${result?.deleted || 0}`));
    }
  } catch (err) {
    error(err instanceof Error ? err.message : "Push failed");
    process.exit(1);
  }
});

// src/commands/switch.ts
import { Command as Command5 } from "commander";
import chalk7 from "chalk";
import inquirer4 from "inquirer";
var switchCommand = new Command5("switch").description("Switch project or environment").argument("[target]", "project slug or environment name").option("-o, --organization <id>", "Switch organization").option("-p, --project <id>", "Switch project").option("-e, --env <environment>", "Switch environment (development, staging, production)").action(async (target, options) => {
  try {
    if (!isAuthenticated()) {
      throw notAuthenticated();
    }
    const api = createAPIClient();
    const projectConfig = readProjectConfig();
    if (options.env || target && ["development", "staging", "production"].includes(target)) {
      const environment = options.env || target;
      if (!projectConfig) {
        error("No project initialized. Run `env-connect init` first.");
        process.exit(1);
      }
      updateProjectConfig({ environment });
      success(`Switched to ${chalk7.bold(environment)} environment`);
      return;
    }
    if (options.organization) {
      const organizations = await withSpinner(
        "Fetching organizations...",
        async () => {
          const response = await api.get(
            "/api/cli/organizations"
          );
          return response.data || [];
        }
      );
      const org = organizations.find(
        (o) => o._id === options.organization || o.slug === options.organization
      );
      if (!org) {
        error(`Organization not found: ${options.organization}`);
        process.exit(1);
      }
      setActiveOrganizationId(org._id);
      if (projectConfig) {
        updateProjectConfig({ organizationId: org._id });
      }
      success(`Switched to organization: ${chalk7.bold(org.name)}`);
      return;
    }
    if (options.project || target) {
      const projectIdentifier = options.project || target;
      let organizationId = projectConfig?.organizationId;
      if (!organizationId) {
        const organizations = await withSpinner(
          "Fetching organizations...",
          async () => {
            const response = await api.get(
              "/api/cli/organizations"
            );
            return response.data || [];
          }
        );
        if (organizations.length === 0) {
          error("No organizations found.");
          process.exit(1);
        }
        if (organizations.length === 1) {
          organizationId = organizations[0]._id;
        } else {
          const { orgId } = await inquirer4.prompt([
            {
              type: "list",
              name: "orgId",
              message: "Select an organization:",
              choices: organizations.map((org) => ({
                name: `${org.name} ${org.tier === "pro" ? chalk7.green("(Pro)") : chalk7.dim("(Free)")}`,
                value: org._id
              }))
            }
          ]);
          organizationId = orgId;
        }
      }
      const projects = await withSpinner(
        "Fetching projects...",
        async () => {
          const response = await api.get(
            "/api/cli/projects",
            { organizationId }
          );
          return response.data || [];
        }
      );
      const project = projects.find(
        (p) => p._id === projectIdentifier || p.slug === projectIdentifier
      );
      if (!project) {
        error(`Project not found: ${projectIdentifier}`);
        console.log();
        console.log("Available projects:");
        for (const p of projects) {
          console.log(`  ${p.icon || "\u{1F4E6}"} ${p.name} (${p.slug})`);
        }
        process.exit(1);
      }
      setActiveProjectId(project._id);
      setActiveOrganizationId(organizationId);
      const environment = projectConfig?.environment || "development";
      writeProjectConfig({
        projectId: project._id,
        organizationId,
        environment
      });
      success(`Switched to project: ${chalk7.bold(project.name)}`);
      return;
    }
    if (!target && !options.project && !options.organization && !options.env) {
      const { switchType } = await inquirer4.prompt([
        {
          type: "list",
          name: "switchType",
          message: "What would you like to switch?",
          choices: [
            { name: "Environment", value: "environment" },
            { name: "Project", value: "project" },
            { name: "Organization", value: "organization" }
          ]
        }
      ]);
      if (switchType === "environment") {
        if (!projectConfig) {
          error("No project initialized. Run `env-connect init` first.");
          process.exit(1);
        }
        const { environment } = await inquirer4.prompt([
          {
            type: "list",
            name: "environment",
            message: "Select environment:",
            choices: [
              { name: "Development", value: "development" },
              { name: "Staging", value: "staging" },
              { name: "Production", value: "production" }
            ],
            default: projectConfig.environment
          }
        ]);
        updateProjectConfig({ environment });
        success(`Switched to ${chalk7.bold(environment)} environment`);
        return;
      }
      if (switchType === "organization" || switchType === "project") {
        const organizations = await withSpinner(
          "Fetching organizations...",
          async () => {
            const response = await api.get(
              "/api/cli/organizations"
            );
            return response.data || [];
          }
        );
        if (organizations.length === 0) {
          error("No organizations found.");
          process.exit(1);
        }
        const { orgId } = await inquirer4.prompt([
          {
            type: "list",
            name: "orgId",
            message: "Select an organization:",
            choices: organizations.map((org) => ({
              name: `${org.name} ${org.tier === "pro" ? chalk7.green("(Pro)") : chalk7.dim("(Free)")}`,
              value: org._id
            })),
            default: projectConfig?.organizationId
          }
        ]);
        if (switchType === "organization") {
          setActiveOrganizationId(orgId);
          const org = organizations.find((o) => o._id === orgId);
          success(`Switched to organization: ${chalk7.bold(org.name)}`);
          return;
        }
        const projects = await withSpinner(
          "Fetching projects...",
          async () => {
            const response = await api.get(
              "/api/cli/projects",
              { organizationId: orgId }
            );
            return response.data || [];
          }
        );
        if (projects.length === 0) {
          error("No projects found in this organization.");
          process.exit(1);
        }
        const { projectId } = await inquirer4.prompt([
          {
            type: "list",
            name: "projectId",
            message: "Select a project:",
            choices: projects.map((project2) => ({
              name: `${project2.icon || "\u{1F4E6}"} ${project2.name}`,
              value: project2._id
            })),
            default: projectConfig?.projectId
          }
        ]);
        const project = projects.find((p) => p._id === projectId);
        const environment = projectConfig?.environment || "development";
        setActiveProjectId(projectId);
        setActiveOrganizationId(orgId);
        writeProjectConfig({
          projectId,
          organizationId: orgId,
          environment
        });
        success(`Switched to project: ${chalk7.bold(project.name)}`);
      }
    }
  } catch (err) {
    error(err instanceof Error ? err.message : "Switch failed");
    process.exit(1);
  }
});

// src/commands/list.ts
import { Command as Command6 } from "commander";
import chalk8 from "chalk";
var listCommand = new Command6("list").description("List resources").argument("[resource]", "Resource type: projects, organizations, variables", "projects").option("-o, --organization <id>", "Organization ID (for projects/variables)").option("-p, --project <id>", "Project ID (for variables)").option("-e, --env <environment>", "Environment filter (for variables)").option("--show-values", "Show actual variable values (masked by default)").option("--json", "Output as JSON").action(async (resource, options) => {
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
      default:
        error(`Unknown resource: ${resource}`);
        console.log();
        console.log("Available resources:");
        console.log("  organizations (orgs)  List your organizations");
        console.log("  projects              List projects in an organization");
        console.log("  variables (vars)      List variables in a project");
        process.exit(1);
    }
  } catch (err) {
    error(err instanceof Error ? err.message : "List failed");
    process.exit(1);
  }
});
async function listOrganizations(api, options) {
  const organizations = await withSpinner(
    "Fetching organizations...",
    async () => {
      const response = await api.get(
        "/api/cli/organizations"
      );
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
      tier: org.tier === "pro" ? chalk8.green("Pro") : chalk8.dim("Free"),
      role: org.role
    })),
    [
      { key: "name", header: "Name" },
      { key: "slug", header: "Slug" },
      { key: "tier", header: "Tier" },
      { key: "role", header: "Role" }
    ]
  );
}
async function listProjects(api, projectConfig, options) {
  let organizationId = options.organization || projectConfig?.organizationId;
  if (!organizationId) {
    const organizations = await withSpinner(
      "Fetching organizations...",
      async () => {
        const response = await api.get(
          "/api/cli/organizations"
        );
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
  const projects = await withSpinner(
    "Fetching projects...",
    async () => {
      const response = await api.get(
        "/api/cli/projects",
        { organizationId }
      );
      return response.data || [];
    }
  );
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
      icon: project.icon || "\u{1F4E6}",
      name: project.name,
      slug: project.slug,
      description: project.description || chalk8.dim("-"),
      active: projectConfig?.projectId === project._id ? chalk8.green("\u2713") : ""
    })),
    [
      { key: "icon", header: "" },
      { key: "name", header: "Name" },
      { key: "slug", header: "Slug" },
      { key: "description", header: "Description", width: 30 },
      { key: "active", header: "" }
    ]
  );
}
async function listVariables(api, projectConfig, options) {
  const projectId = options.project || projectConfig?.projectId;
  const environment = options.env || projectConfig?.environment;
  if (!projectId) {
    error("No project specified. Use --project or run `env-connect init` first.");
    process.exit(1);
  }
  const variables = await withSpinner(
    "Fetching variables...",
    async () => {
      const params = { projectId };
      if (environment) {
        params.environment = environment;
      }
      const response = await api.get("/api/cli/variables", params);
      return response.data || [];
    }
  );
  if (variables.length === 0) {
    info(`No variables found${environment ? ` for ${environment}` : ""}.`);
    return;
  }
  if (options.json) {
    const output = variables.map((v) => ({
      ...v,
      value: options.showValues ? v.value : maskValue(v.value)
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
      sensitive: variable.isSensitive ? chalk8.yellow("\u25CF") : "",
      version: `v${variable.version}`
    })),
    [
      { key: "key", header: "Key" },
      { key: "value", header: "Value", width: 40 },
      { key: "sensitive", header: "" },
      { key: "version", header: "Ver" }
    ]
  );
  console.log();
  console.log(chalk8.dim(`Total: ${variables.length} variables`));
  if (!options.showValues) {
    console.log(chalk8.dim("Use --show-values to see actual values"));
  }
}

// src/commands/config.ts
import { Command as Command7 } from "commander";
import chalk9 from "chalk";
var configCommand = new Command7("config").description("Manage CLI configuration").argument("[action]", "Action: get, set, list, path, reset").argument("[key]", "Config key (for get/set)").argument("[value]", "Config value (for set)").action(async (action, key, value) => {
  try {
    switch (action) {
      case "get":
        await handleGet(key);
        break;
      case "set":
        await handleSet(key, value);
        break;
      case "list":
      case void 0:
        await handleList();
        break;
      case "path":
        await handlePath();
        break;
      case "reset":
        await handleReset();
        break;
      default:
        error(`Unknown action: ${action}`);
        console.log();
        console.log("Available actions:");
        console.log("  list          Show all configuration");
        console.log("  get <key>     Get a specific config value");
        console.log("  set <key> <value>  Set a config value");
        console.log("  path          Show config file locations");
        console.log("  reset         Reset all configuration");
        process.exit(1);
    }
  } catch (err) {
    error(err instanceof Error ? err.message : "Config operation failed");
    process.exit(1);
  }
});
async function handleGet(key) {
  if (!key) {
    error("Missing key. Usage: env-connect config get <key>");
    console.log();
    console.log("Available keys:");
    console.log("  apiUrl              API endpoint URL");
    console.log("  user                Current authenticated user");
    console.log("  activeProjectId     Currently active project");
    console.log("  activeOrganizationId Currently active organization");
    process.exit(1);
  }
  const config2 = getConfig();
  switch (key) {
    case "apiUrl":
      console.log(config2.apiUrl);
      break;
    case "user":
      if (config2.user) {
        console.log(JSON.stringify(config2.user, null, 2));
      } else {
        console.log(chalk9.dim("(not set)"));
      }
      break;
    case "activeProjectId":
      console.log(config2.activeProjectId || chalk9.dim("(not set)"));
      break;
    case "activeOrganizationId":
      console.log(config2.activeOrganizationId || chalk9.dim("(not set)"));
      break;
    default:
      error(`Unknown key: ${key}`);
      process.exit(1);
  }
}
async function handleSet(key, value) {
  if (!key || value === void 0) {
    error("Missing key or value. Usage: env-connect config set <key> <value>");
    console.log();
    console.log("Settable keys:");
    console.log("  apiUrl    API endpoint URL");
    process.exit(1);
  }
  switch (key) {
    case "apiUrl":
      try {
        new URL(value);
      } catch {
        error("Invalid URL format");
        process.exit(1);
      }
      setApiUrl(value);
      success(`Set apiUrl to ${value}`);
      break;
    default:
      error(`Cannot set key: ${key}`);
      console.log();
      console.log("Settable keys:");
      console.log("  apiUrl    API endpoint URL");
      process.exit(1);
  }
}
async function handleList() {
  const config2 = getConfig();
  const projectConfig = readProjectConfig();
  header("Global Configuration");
  console.log();
  keyValue([
    ["API URL", config2.apiUrl],
    ["Authenticated", isAuthenticated() ? chalk9.green("Yes") : chalk9.red("No")],
    ["User", config2.user?.email],
    ["Active Organization", config2.activeOrganizationId],
    ["Active Project", config2.activeProjectId]
  ]);
  console.log();
  if (projectConfig) {
    header("Project Configuration (.envconnect)");
    console.log();
    keyValue([
      ["Project ID", projectConfig.projectId],
      ["Organization ID", projectConfig.organizationId],
      ["Environment", projectConfig.environment]
    ]);
    console.log();
  } else {
    info("No project configuration found in current directory.");
    console.log();
  }
}
async function handlePath() {
  header("Configuration Paths");
  console.log();
  keyValue([
    ["Global config", getConfigPath()],
    ["Project config", getProjectConfigPath()]
  ]);
}
async function handleReset() {
  const inquirer5 = await import("inquirer");
  const { confirm } = await inquirer5.default.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Are you sure you want to reset all configuration? This will log you out.",
      default: false
    }
  ]);
  if (!confirm) {
    info("Reset cancelled.");
    return;
  }
  clearConfig();
  success("Configuration reset.");
}

// src/commands/logout.ts
import { Command as Command8 } from "commander";
var logoutCommand = new Command8("logout").description("Log out from ENV Connect").action(async () => {
  try {
    if (!isAuthenticated()) {
      info("You are not logged in.");
      return;
    }
    const user = getUser();
    const api = createAPIClient();
    try {
      await api.post("/api/cli/auth?action=revoke", {});
    } catch {
    }
    clearAuth();
    success(`Logged out${user?.email ? ` from ${user.email}` : ""}`);
  } catch (err) {
    error(err instanceof Error ? err.message : "Logout failed");
    process.exit(1);
  }
});

// src/index.ts
var program = new Command9();
program.name("env-connect").description("ENV Connect CLI - Sync, secure, and share environment variables").version("0.1.0");
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(initCommand);
program.addCommand(pullCommand);
program.addCommand(pushCommand);
program.addCommand(switchCommand);
program.addCommand(listCommand);
program.addCommand(configCommand);
program.parse();
