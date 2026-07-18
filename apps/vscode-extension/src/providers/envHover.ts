// Portions derived from DopplerHQ/vscode (https://github.com/DopplerHQ/vscode), Apache-2.0.

import * as vscode from "vscode";
import { findEnvKeyMatches } from "../utils/envKeyMatch";
import { fileProtectionMode } from "../roles";
import type { ApiService } from "../services/api";
import {
  fetchKeyEnvironments,
  resolveProjectForDocument,
  type IntelliSenseDeps,
} from "./autocomplete";

/** VS Code language id → ENV_KEY_REGEX language. */
const HOVER_LANGUAGE: Record<string, string> = {
  javascript: "javascript",
  typescript: "javascript",
  javascriptreact: "javascript",
  typescriptreact: "javascript",
  vue: "javascript",
  ruby: "ruby",
  python: "python",
  php: "php",
  go: "go",
  java: "java",
  csharp: "csharp",
  rust: "rust",
};

const MASK = "••••••••";

async function hover(
  deps: IntelliSenseDeps,
  language: string,
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover | null> {
  if (
    !vscode.workspace
      .getConfiguration("envpilot")
      .get<boolean>("hover.enable", true)
  ) {
    return null;
  }
  if (!(await deps.auth.isAuthenticated())) {
    return null;
  }
  const resolved = await resolveProjectForDocument(
    deps.storage,
    document.uri.fsPath
  );
  if (!resolved) {
    return null;
  }

  const line = document.lineAt(position).text;
  const match = findEnvKeyMatches(language, line).find(
    (m) => position.character >= m.start && position.character <= m.end
  );
  if (!match) {
    return null;
  }

  const keys = await fetchKeyEnvironments(
    deps.api,
    resolved.project,
    resolved.environments
  );
  const envs = keys.get(match.key);
  if (!envs) {
    return null;
  }

  // The value itself is NEVER rendered here — only the mask. Revealing goes
  // through the envpilot.revealHoverValue command, which re-checks the role.
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown(
    `**Envpilot**\n\nProject: ${resolved.project.projectName}\n\nEnvironment: ${envs.join(", ")}`
  );
  markdown.appendCodeblock(MASK, "text");
  const args = encodeURIComponent(
    JSON.stringify({
      key: match.key,
      projectId: resolved.project.projectId,
      environment: envs[0],
    })
  );
  markdown.appendMarkdown(
    `\n[Reveal value](command:envpilot.revealHoverValue?${args})`
  );
  // Required for the command link to be clickable.
  markdown.isTrusted = true;
  return new vscode.Hover(markdown);
}

export function registerEnvHover(
  context: vscode.ExtensionContext,
  deps: IntelliSenseDeps
): void {
  for (const [languageId, language] of Object.entries(HOVER_LANGUAGE)) {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        { scheme: "file", language: languageId },
        {
          provideHover: (document, position) =>
            hover(deps, language, document, position),
        }
      )
    );
  }
}

/**
 * Handler for the hover's "Reveal value" command link. Re-checks the user's
 * role first (mirrors the file-protection mode logic) — strict-readonly users
 * never see values. The value is shown in a notification, never in the hover.
 */
export async function revealHoverValue(
  api: ApiService,
  args?: { key?: string; projectId?: string; environment?: string }
): Promise<void> {
  if (!args?.key || !args.projectId || !args.environment) {
    return;
  }

  // Access meta rides on the same request that fetches variables; populate it
  // if this project hasn't been fetched yet this session.
  if (!api.getAccessMeta(args.projectId)) {
    await api.getVariablesMetadata(args.projectId, args.environment);
  }
  const meta = api.getAccessMeta(args.projectId);
  const mode = fileProtectionMode(
    {
      role: meta?.unifiedRole ?? api.getUserRole(args.projectId) ?? "",
      assigned: meta?.assigned ?? false,
      environmentScope: meta?.environmentScope,
      hasWriteAccess: meta?.hasWriteAccess ?? false,
    },
    meta?.capabilities ?? null
  );
  if (mode === "strict-readonly") {
    vscode.window.showInformationMessage(
      "Envpilot: Your role does not permit revealing values."
    );
    return;
  }

  const variables = await api.getVariables(args.projectId, args.environment);
  const variable = variables.find((v) => v.key === args.key);
  if (!variable) {
    vscode.window.showWarningMessage(
      `Envpilot: ${args.key} was not found in ${args.environment}.`
    );
    return;
  }
  vscode.window.showInformationMessage(`${args.key} = ${variable.value}`);
}
