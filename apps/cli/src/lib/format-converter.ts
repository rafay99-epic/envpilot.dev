import { parseEnvFile, stringifyEnv } from "./env-file.js";

export type FormatType =
  | "env"
  | "json"
  | "yaml"
  | "docker-compose"
  | "aws"
  | "vercel"
  | "netlify";

export const ALL_FORMATS: FormatType[] = [
  "env",
  "json",
  "yaml",
  "docker-compose",
  "aws",
  "vercel",
  "netlify",
];

export interface SerializeMeta {
  projectName?: string;
  environment?: string;
  prefix?: string;
}

// ── Serialize ──────────────────────────────────────────────

export function serialize(
  vars: Record<string, string>,
  format: FormatType,
  meta?: SerializeMeta
): string {
  switch (format) {
    case "env":
      return serializeEnv(vars, meta);
    case "json":
      return serializeJson(vars);
    case "yaml":
      return serializeYaml(vars, meta);
    case "docker-compose":
      return serializeDockerCompose(vars, meta);
    case "aws":
      return serializeAws(vars, meta);
    case "vercel":
      return serializeVercel(vars);
    case "netlify":
      return serializeNetlify(vars, meta);
  }
}

// ── Parse ──────────────────────────────────────────────────

export function parse(
  content: string,
  format: FormatType,
  options?: { prefix?: string }
): Record<string, string> {
  switch (format) {
    case "env":
      return parseEnvFile(content);
    case "json":
      return parseJson(content);
    case "yaml":
      return parseYaml(content);
    case "docker-compose":
      return parseDockerCompose(content);
    case "aws":
      return parseAws(content, options?.prefix);
    case "vercel":
      return parseVercel(content);
    case "netlify":
      return parseNetlify(content);
  }
}

// ── Helpers ────────────────────────────────────────────────

export function getFileExtension(format: FormatType): string {
  switch (format) {
    case "env":
      return ".env";
    case "json":
      return ".json";
    case "yaml":
      return ".yaml";
    case "docker-compose":
      return ".yml";
    case "aws":
      return ".json";
    case "vercel":
      return ".json";
    case "netlify":
      return ".toml";
  }
}

export function getContentType(format: FormatType): string {
  switch (format) {
    case "env":
      return "text/plain";
    case "json":
    case "aws":
    case "vercel":
      return "application/json";
    case "yaml":
    case "docker-compose":
      return "text/yaml";
    case "netlify":
      return "text/plain";
  }
}

export function getDefaultFilename(
  format: FormatType,
  environment?: string
): string {
  const env = environment || "development";
  switch (format) {
    case "env":
      return env === "development" ? ".env.local" : `.env.${env}`;
    case "json":
      return `${env}.json`;
    case "yaml":
      return `${env}.yaml`;
    case "docker-compose":
      return "docker-compose.yml";
    case "aws":
      return `${env}.aws.json`;
    case "vercel":
      return `${env}.vercel.json`;
    case "netlify":
      return "netlify.toml";
  }
}

// ── Format: env ────────────────────────────────────────────

function serializeEnv(
  vars: Record<string, string>,
  meta?: SerializeMeta
): string {
  const lines: string[] = [];
  if (meta?.environment) {
    lines.push(`# Environment: ${meta.environment}`);
  }
  if (meta?.projectName) {
    lines.push(`# Project: ${meta.projectName}`);
  }
  if (lines.length > 0) {
    lines.push(`# Exported: ${new Date().toISOString()}`);
    lines.push("");
  }
  return lines.join("\n") + stringifyEnv(vars, { sort: true });
}

// ── Format: JSON ───────────────────────────────────────────

function serializeJson(vars: Record<string, string>): string {
  const sorted = Object.keys(vars)
    .sort()
    .reduce(
      (obj, key) => {
        obj[key] = vars[key];
        return obj;
      },
      {} as Record<string, string>
    );
  return JSON.stringify(sorted, null, 2) + "\n";
}

function parseJson(content: string): Record<string, string> {
  const data = JSON.parse(content);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Expected a JSON object with string key-value pairs");
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (value !== null && value !== undefined) {
      result[key] = String(value);
    }
  }
  return result;
}

// ── Format: YAML ───────────────────────────────────────────

function yamlQuote(value: string): string {
  if (
    value === "" ||
    value === "true" ||
    value === "false" ||
    value === "null" ||
    value === "~" ||
    /^[0-9]/.test(value) ||
    /[:#\[\]{}&*!|>'"%@`]/.test(value) ||
    value.includes("\n") ||
    value.startsWith(" ") ||
    value.endsWith(" ")
  ) {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `"${escaped}"`;
  }
  return value;
}

function serializeYaml(
  vars: Record<string, string>,
  meta?: SerializeMeta
): string {
  const lines: string[] = [];
  if (meta?.environment) {
    lines.push(`# Environment: ${meta.environment}`);
  }
  if (meta?.projectName) {
    lines.push(`# Project: ${meta.projectName}`);
  }
  if (lines.length > 0) {
    lines.push("");
  }
  for (const key of Object.keys(vars).sort()) {
    lines.push(`${key}: ${yamlQuote(vars[key])}`);
  }
  return lines.join("\n") + "\n";
}

function parseYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(": ");
    if (colonIndex === -1) {
      // Handle "key:" with no value
      if (trimmed.endsWith(":")) {
        const key = trimmed.slice(0, -1).trim();
        if (key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          result[key] = "";
        }
      }
      continue;
    }

    const key = trimmed.substring(0, colonIndex).trim();
    let value = trimmed.substring(colonIndex + 2).trim();

    // Skip nested YAML (indented or complex keys)
    if (line.startsWith(" ") || line.startsWith("\t")) continue;

    // Unquote value
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
      if (value.includes("\\")) {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      result[key] = value;
    }
  }
  return result;
}

// ── Format: Docker Compose ─────────────────────────────────

function serializeDockerCompose(
  vars: Record<string, string>,
  meta?: SerializeMeta
): string {
  const lines: string[] = [];
  if (meta?.environment || meta?.projectName) {
    lines.push("# Docker Compose environment variables");
    if (meta.projectName) lines.push(`# Project: ${meta.projectName}`);
    if (meta.environment) lines.push(`# Environment: ${meta.environment}`);
    lines.push("");
  }
  lines.push("services:");
  lines.push("  app:");
  lines.push("    environment:");
  for (const key of Object.keys(vars).sort()) {
    lines.push(`      ${key}: ${yamlQuote(vars[key])}`);
  }
  return lines.join("\n") + "\n";
}

function parseDockerCompose(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");
  let inEnvironment = false;
  let environmentIndent = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Detect indentation level
    const indent = line.length - line.trimStart().length;

    if (trimmed === "environment:") {
      inEnvironment = true;
      environmentIndent = indent;
      continue;
    }

    if (inEnvironment) {
      // Exit environment section if we see a key at or above environment's indent level
      if (indent <= environmentIndent && trimmed !== "") {
        inEnvironment = false;
        environmentIndent = -1;
        continue;
      }

      // Handle list format: - KEY=value
      if (trimmed.startsWith("- ")) {
        const entry = trimmed.slice(2);
        const eqIdx = entry.indexOf("=");
        if (eqIdx !== -1) {
          const key = entry.substring(0, eqIdx).trim();
          let value = entry.substring(eqIdx + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            result[key] = value;
          }
        }
        continue;
      }

      // Handle map format: KEY: value
      const colonIndex = trimmed.indexOf(": ");
      if (colonIndex !== -1) {
        const key = trimmed.substring(0, colonIndex).trim();
        let value = trimmed.substring(colonIndex + 2).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
          if (value.includes("\\")) {
            value = value
              .replace(/\\n/g, "\n")
              .replace(/\\r/g, "\r")
              .replace(/\\t/g, "\t")
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, "\\");
          }
        }
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          result[key] = value;
        }
      } else if (trimmed.endsWith(":")) {
        const key = trimmed.slice(0, -1).trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          result[key] = "";
        }
      }
    }
  }
  return result;
}

// ── Format: AWS Parameter Store ────────────────────────────

function serializeAws(
  vars: Record<string, string>,
  meta?: SerializeMeta
): string {
  const prefix = meta?.prefix || `/${meta?.projectName || "app"}`;
  const parameters = Object.keys(vars)
    .sort()
    .map((key) => ({
      name: `${prefix}/${key}`,
      value: vars[key],
      type: "SecureString",
    }));
  return JSON.stringify({ parameters }, null, 2) + "\n";
}

function parseAws(content: string, prefix?: string): Record<string, string> {
  const data = JSON.parse(content);
  const result: Record<string, string> = {};

  const params = data.parameters || data.Parameters || [];
  if (!Array.isArray(params)) {
    throw new Error(
      "Expected AWS Parameter Store format with 'parameters' array"
    );
  }

  for (const param of params) {
    const name: string = param.name || param.Name || "";
    const value: string = param.value || param.Value || "";

    let key: string;
    if (prefix && name.startsWith(prefix + "/")) {
      key = name.substring(prefix.length + 1);
    } else {
      // Extract last segment after final /
      const lastSlash = name.lastIndexOf("/");
      key = lastSlash !== -1 ? name.substring(lastSlash + 1) : name;
    }

    if (key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      result[key] = value;
    }
  }
  return result;
}

// ── Format: Vercel ─────────────────────────────────────────

function serializeVercel(vars: Record<string, string>): string {
  const sorted = Object.keys(vars)
    .sort()
    .reduce(
      (obj, key) => {
        obj[key] = vars[key];
        return obj;
      },
      {} as Record<string, string>
    );
  return JSON.stringify({ env: sorted }, null, 2) + "\n";
}

function parseVercel(content: string): Record<string, string> {
  const data = JSON.parse(content);
  const result: Record<string, string> = {};

  const env = data.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    throw new Error("Expected Vercel format with 'env' object");
  }

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (value !== null && value !== undefined) {
      result[key] = String(value);
    }
  }
  return result;
}

// ── Format: Netlify ────────────────────────────────────────

function tomlQuote(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

function serializeNetlify(
  vars: Record<string, string>,
  meta?: SerializeMeta
): string {
  const lines: string[] = [];
  if (meta?.environment || meta?.projectName) {
    if (meta.projectName) lines.push(`# Project: ${meta.projectName}`);
    if (meta.environment) lines.push(`# Environment: ${meta.environment}`);
    lines.push("");
  }
  lines.push("[build.environment]");
  for (const key of Object.keys(vars).sort()) {
    lines.push(`  ${key} = ${tomlQuote(vars[key])}`);
  }
  return lines.join("\n") + "\n";
}

function parseNetlify(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");
  let inBuildEnv = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for section headers. Netlify exposes env vars both under the
    // global [build.environment] block and under context-scoped blocks like
    // [context.production.environment] or [context.deploy-preview.environment].
    if (trimmed.startsWith("[")) {
      inBuildEnv =
        trimmed === "[build.environment]" ||
        /^\[context\.[^.\]]+\.environment\]$/.test(trimmed);
      continue;
    }

    if (!inBuildEnv) continue;
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Parse KEY = "value"
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Unquote TOML string
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    } else if (value.startsWith("'") && value.endsWith("'")) {
      // TOML literal string — no escape processing
      value = value.slice(1, -1);
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      result[key] = value;
    }
  }
  return result;
}
