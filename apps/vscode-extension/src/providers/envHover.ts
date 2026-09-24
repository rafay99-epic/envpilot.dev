// Portions derived from DopplerHQ/vscode (https://github.com/DopplerHQ/vscode), Apache-2.0.
import * as vscode from "vscode";
import { findEnvKeyMatches } from "../utils/envKeyMatch";
import type { ApiService } from "../services/api";
import type { StorageService } from "../utils/storage";
import {
  LANGUAGE_SPECS,
  fetchKeyEnvironments,
  resolveProjectForDocument,
  type IntelliSenseDeps,
} from "./autocomplete";

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
  const resolved = resolveProjectForDocument(deps.storage, document.uri.fsPath);
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

  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown("**Envpilot**\n\nProject: ");
  markdown.appendText(resolved.project.projectName);
  markdown.appendMarkdown("\n\nEnvironment: ");
  markdown.appendText(envs.join(", "));
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
  markdown.isTrusted = { enabledCommands: ["envpilot.revealHoverValue"] };
  return new vscode.Hover(markdown);
}

export function registerEnvHover(
  context: vscode.ExtensionContext,
  deps: IntelliSenseDeps
): void {
  for (const spec of LANGUAGE_SPECS) {
    const [hoverLanguage] = spec.languages;
    for (const language of spec.languages) {
      context.subscriptions.push(
        vscode.languages.registerHoverProvider(
          { scheme: "file", language },
          {
            provideHover: (document, position) =>
              hover(deps, hoverLanguage, document, position),
          }
        )
      );
    }
  }
}

export async function revealHoverValue(
  api: ApiService,
  storage: StorageService,
  args?: { key?: unknown; projectId?: unknown; environment?: unknown }
): Promise<void> {
  const key = args?.key;
  const projectId = args?.projectId;
  const environment = args?.environment;
  if (
    typeof key !== "string" ||
    typeof projectId !== "string" ||
    typeof environment !== "string"
  ) {
    return;
  }
  if (
    !storage
      .getLinkedProjectsMetadataV2()
      .some((project) => project.projectId === projectId)
  ) {
    vscode.window.showWarningMessage(
      "Envpilot: this project is no longer linked."
    );
    return;
  }

  if (!api.getAccessMeta(projectId)) {
    await api.getVariablesMetadata(projectId, environment);
  }
  if (
    api.getAccessMeta(projectId)?.capabilities?.["project.secrets.reveal"] !==
    true
  ) {
    vscode.window.showWarningMessage(
      "Envpilot: your role does not allow revealing secret values."
    );
    return;
  }

  const variable = (await api.getVariables(projectId, environment)).find(
    (v) => v.key === key
  );
  if (!variable) {
    vscode.window.showWarningMessage(
      `Envpilot: ${key} was not found in ${environment}.`
    );
    return;
  }
  void vscode.window.showInformationMessage(`${key} = ${variable.value}`, {
    modal: true,
  });
}
