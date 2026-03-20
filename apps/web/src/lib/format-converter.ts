/**
 * Multi-format serialization/parsing for environment variables.
 * Supports: env, json, yaml, docker-compose, aws, vercel, netlify
 */

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

export const FORMAT_LABELS: Record<FormatType, string> = {
  env: ".env",
  json: "JSON",
  yaml: "YAML",
  "docker-compose": "Docker Compose",
  aws: "AWS Parameter Store",
  vercel: "Vercel",
  netlify: "Netlify",
};

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
      return parseEnvContent(content);
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
    case "aws":
    case "vercel":
      return ".json";
    case "yaml":
      return ".yaml";
    case "docker-compose":
      return ".yml";
    case "netlify":
      return ".toml";
  }
}

export function getContentType(format: FormatType): string {
  switch (format) {
    case "env":
    case "netlify":
      return "text/plain";
    case "json":
    case "aws":
    case "vercel":
      return "application/json";
    case "yaml":
    case "docker-compose":
      return "text/yaml";
  }
}

export function detectFormatFromExtension(filename: string): FormatType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".env") || lower.startsWith(".env")) return "env";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    if (lower.includes("docker-compose") || lower.includes("compose"))
      return "docker-compose";
    return "yaml";
  }
  if (lower.endsWith(".toml")) return "netlify";
  if (lower.endsWith(".json")) {
    // Can't distinguish json/aws/vercel from extension alone
    return "json";
  }
  return null;
}

// ── Format: env ────────────────────────────────────────────

function serializeEnv(
  vars: Record<string, string>,
  meta?: SerializeMeta
): string {
  const lines: string[] = [];
  if (meta?.environment) lines.push(`# Environment: ${meta.environment}`);
  if (meta?.projectName) lines.push(`# Project: ${meta.projectName}`);
  if (lines.length > 0) {
    lines.push(`# Exported: ${new Date().toISOString()}`);
    lines.push("");
  }
  for (const key of Object.keys(vars).sort()) {
    const value = vars[key];
    const needsQuotes =
      value.includes("\n") ||
      value.includes("\r") ||
      value.includes('"') ||
      value.includes("'") ||
      value.includes(" ") ||
      value.includes("#") ||
      value.startsWith(" ") ||
      value.endsWith(" ");
    if (needsQuotes) {
      const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      lines.push(`${key}="${escaped}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  return lines.join("\n") + "\n";
}

function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.substring(0, eqIdx).trim();
    let value = line.substring(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      const commentIdx = value.indexOf(" #");
      if (commentIdx !== -1) value = value.substring(0, commentIdx).trim();
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) result[key] = value;
  }
  return result;
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
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new Error("Expected a JSON object with string key-value pairs");
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") result[key] = value;
    else if (value !== null && value !== undefined) result[key] = String(value);
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
  if (meta?.environment) lines.push(`# Environment: ${meta.environment}`);
  if (meta?.projectName) lines.push(`# Project: ${meta.projectName}`);
  if (lines.length > 0) lines.push("");
  for (const key of Object.keys(vars).sort())
    lines.push(`${key}: ${yamlQuote(vars[key])}`);
  return lines.join("\n") + "\n";
}

function parseYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (line.startsWith(" ") || line.startsWith("\t")) continue;
    const colonIdx = trimmed.indexOf(": ");
    if (colonIdx === -1) {
      if (trimmed.endsWith(":")) {
        const key = trimmed.slice(0, -1).trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) result[key] = "";
      }
      continue;
    }
    const key = trimmed.substring(0, colonIdx).trim();
    let value = trimmed.substring(colonIdx + 2).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
      if (value.includes("\\"))
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) result[key] = value;
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
    if (meta?.projectName) lines.push(`# Project: ${meta.projectName}`);
    if (meta?.environment) lines.push(`# Environment: ${meta.environment}`);
    lines.push("");
  }
  lines.push("services:");
  lines.push("  app:");
  lines.push("    environment:");
  for (const key of Object.keys(vars).sort())
    lines.push(`      ${key}: ${yamlQuote(vars[key])}`);
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
    const indent = line.length - line.trimStart().length;
    if (trimmed === "environment:") {
      inEnvironment = true;
      environmentIndent = indent;
      continue;
    }
    if (inEnvironment) {
      if (indent <= environmentIndent && trimmed !== "") {
        inEnvironment = false;
        continue;
      }
      if (trimmed.startsWith("- ")) {
        const entry = trimmed.slice(2);
        const eqIdx = entry.indexOf("=");
        if (eqIdx !== -1) {
          const key = entry.substring(0, eqIdx).trim();
          let value = entry.substring(eqIdx + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          )
            value = value.slice(1, -1);
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) result[key] = value;
        }
        continue;
      }
      const colonIdx = trimmed.indexOf(": ");
      if (colonIdx !== -1) {
        const key = trimmed.substring(0, colonIdx).trim();
        let value = trimmed.substring(colonIdx + 2).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
          if (value.includes("\\"))
            value = value
              .replace(/\\n/g, "\n")
              .replace(/\\r/g, "\r")
              .replace(/\\t/g, "\t")
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, "\\");
        }
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) result[key] = value;
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
  if (!Array.isArray(params))
    throw new Error(
      "Expected AWS Parameter Store format with 'parameters' array"
    );
  for (const param of params) {
    const name: string = param.name || param.Name || "";
    const value: string = param.value || param.Value || "";
    let key: string;
    if (prefix && name.startsWith(prefix + "/"))
      key = name.substring(prefix.length + 1);
    else {
      const lastSlash = name.lastIndexOf("/");
      key = lastSlash !== -1 ? name.substring(lastSlash + 1) : name;
    }
    if (key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) result[key] = value;
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
  const env = data.env;
  if (!env || typeof env !== "object" || Array.isArray(env))
    throw new Error("Expected Vercel format with 'env' object");
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") result[key] = value;
    else if (value !== null && value !== undefined) result[key] = String(value);
  }
  return result;
}

// ── Format: Netlify ────────────────────────────────────────

function serializeNetlify(
  vars: Record<string, string>,
  meta?: SerializeMeta
): string {
  const lines: string[] = [];
  if (meta?.projectName) lines.push(`# Project: ${meta.projectName}`);
  if (meta?.environment) lines.push(`# Environment: ${meta.environment}`);
  if (lines.length > 0) lines.push("");
  lines.push("[build.environment]");
  for (const key of Object.keys(vars).sort()) {
    const escaped = vars[key]
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    lines.push(`  ${key} = "${escaped}"`);
  }
  return lines.join("\n") + "\n";
}

function parseNetlify(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  let inBuildEnv = false;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inBuildEnv = trimmed === "[build.environment]";
      continue;
    }
    if (!inBuildEnv || !trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) result[key] = value;
  }
  return result;
}
