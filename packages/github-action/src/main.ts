import * as core from "@actions/core";

// ── Types ────────────────────────────────────────────────────────────────────

interface Variable {
  _id: string;
  key: string;
  value: string;
  environment: string;
  description?: string;
  isSensitive?: boolean;
  version?: number;
}

interface ApiMeta {
  total: number;
  environment: string;
  decryptionFailures?: string[];
}

interface ApiResponse {
  success: boolean;
  data: Variable[];
  meta: ApiMeta;
  error?: string;
}

// ── Type guards ───────────────────────────────────────────────────────────────

function isApiResponse(value: unknown): value is ApiResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["success"] === "boolean" &&
    Array.isArray(obj["data"]) &&
    typeof obj["meta"] === "object" &&
    obj["meta"] !== null
  );
}

function isVariable(value: unknown): value is Variable {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["_id"] === "string" &&
    typeof obj["key"] === "string" &&
    typeof obj["value"] === "string"
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  try {
    // ── Inputs ───────────────────────────────────────────────────────────────
    const token = core.getInput("token", { required: true });
    const projectId = core.getInput("project-id", { required: true });
    const environment = core.getInput("environment") || "production";
    const apiUrl = (
      core.getInput("api-url") || "https://www.envpilot.dev"
    ).replace(/\/$/, "");
    const exportEnv = core.getBooleanInput("export-env");
    const maskValues = core.getBooleanInput("mask-values");

    core.info(
      `Fetching variables for project ${projectId} [${environment}] from ${apiUrl}…`
    );

    // ── Build request URL ─────────────────────────────────────────────────────
    const url = new URL("/api/token/variables", apiUrl);
    url.searchParams.set("projectId", projectId);
    url.searchParams.set("environment", environment);

    // ── Fetch (with 30-second timeout) ───────────────────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "envpilot-github-action/1.0.0",
        },
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === "AbortError") {
        core.setFailed(`Request to ${apiUrl} timed out after 30 seconds.`);
      } else {
        core.setFailed(`Network error reaching ${apiUrl}: ${msg}`);
      }
      return;
    } finally {
      clearTimeout(timeoutId);
    }

    // ── HTTP-level error handling ─────────────────────────────────────────────
    if (response.status === 401) {
      core.setFailed(
        "Authentication failed. Verify your ENVPILOT_TOKEN secret is correct and has not expired."
      );
      return;
    }

    if (response.status === 402) {
      core.setFailed(
        "CI/CD Access Tokens require a Pro plan. Upgrade your Envpilot subscription to use this action."
      );
      return;
    }

    if (response.status === 403) {
      core.setFailed(
        "Access denied. Your token does not have permission to access this project or environment."
      );
      return;
    }

    if (response.status === 404) {
      core.setFailed(
        `Project "${projectId}" not found. Check the project-id input.`
      );
      return;
    }

    if (!response.ok) {
      let body: string;
      try {
        body = await response.text();
      } catch {
        body = "(unreadable response body)";
      }
      core.setFailed(`API request failed (HTTP ${response.status}): ${body}`);
      return;
    }

    // ── Parse response ────────────────────────────────────────────────────────
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      core.setFailed("Failed to parse API response as JSON.");
      return;
    }

    if (!isApiResponse(parsed)) {
      core.setFailed(
        `Unexpected API response shape: ${JSON.stringify(parsed).slice(0, 200)}`
      );
      return;
    }

    if (!parsed.success) {
      core.setFailed(
        `API returned an error: ${parsed.error ?? "unknown error"}`
      );
      return;
    }

    // Validate each item in data array
    const variables: Variable[] = [];
    for (const item of parsed.data) {
      if (isVariable(item)) {
        variables.push(item);
      } else {
        core.warning(
          `Skipping malformed variable in response: ${JSON.stringify(item).slice(0, 100)}`
        );
      }
    }

    const failures = parsed.meta?.decryptionFailures ?? [];

    // ── Mask values BEFORE any logging ───────────────────────────────────────
    // Must happen first so even "injected N variables" lines cannot leak values.
    if (maskValues) {
      for (const v of variables) {
        if (v.value) {
          core.setSecret(v.value);
        }
      }
    }

    // ── Export to $GITHUB_ENV ─────────────────────────────────────────────────
    if (exportEnv) {
      for (const v of variables) {
        core.exportVariable(v.key, v.value);
      }
      core.info(
        `Injected ${variables.length} variable${variables.length !== 1 ? "s" : ""} into the job environment`
      );
    } else {
      core.info(
        `Fetched ${variables.length} variable${variables.length !== 1 ? "s" : ""} (export-env is false — not exported)`
      );
    }

    // ── Warn about decryption failures ───────────────────────────────────────
    if (failures.length > 0) {
      core.warning(
        `${failures.length} variable${failures.length !== 1 ? "s" : ""} could not be decrypted and were skipped: ${failures.join(", ")}. Check server logs for details.`
      );
    }

    // ── Set outputs ───────────────────────────────────────────────────────────
    core.setOutput("injected-count", String(variables.length));
    core.setOutput("failed-count", String(failures.length));
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
