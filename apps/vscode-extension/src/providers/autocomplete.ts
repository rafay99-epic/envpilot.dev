// Portions derived from DopplerHQ/vscode (https://github.com/DopplerHQ/vscode), Apache-2.0.
import * as vscode from "vscode";
import * as path from "path";
import type { ApiService } from "../services/api";
import type { AuthService } from "../services/auth";
import type { StorageService } from "../utils/storage";
import type { LinkedProjectV2 } from "../types";
import { isPathInside } from "../utils/paths";

export interface IntelliSenseDeps {
  api: ApiService;
  auth: AuthService;
  storage: StorageService;
}

export type LinkedProjectInfo = Omit<LinkedProjectV2, "accessToken">;

export function resolveProjectForDocument(
  storage: StorageService,
  documentPath: string
): { project: LinkedProjectInfo; environments: string[] } | null {
  const docDir = path.dirname(documentPath);
  for (const project of storage.getLinkedProjectsMetadataV2()) {
    const dir = project.directories.find((d) =>
      isPathInside(docDir, d.directoryPath)
    );
    if (dir) {
      const environments =
        dir.environments.length > 0
          ? dir.environments
          : [project.defaultEnvironment];
      return { project, environments };
    }
  }
  return null;
}

export async function fetchKeyEnvironments(
  api: ApiService,
  project: LinkedProjectInfo,
  environments: string[]
): Promise<Map<string, string[]>> {
  const perEnv = await Promise.all(
    environments.map(async (environment) => ({
      environment,
      variables: await api.getVariablesMetadata(
        project.projectId,
        environment,
        project.organizationId
      ),
    }))
  );

  const keys = new Map<string, string[]>();
  for (const { environment, variables } of perEnv) {
    for (const variable of variables) {
      const envs = keys.get(variable.key) ?? [];
      if (!envs.includes(environment)) {
        envs.push(environment);
      }
      keys.set(variable.key, envs);
    }
  }
  return keys;
}

async function autocomplete(
  deps: IntelliSenseDeps,
  triggerCharacter: string,
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.CompletionItem[] | null> {
  if (
    !vscode.workspace
      .getConfiguration("envpilot")
      .get<boolean>("autocomplete.enable", true)
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

  const keys = await fetchKeyEnvironments(
    deps.api,
    resolved.project,
    resolved.environments
  );

  const ignoreTriggers = ["'", "`", '"', "."];
  const quote = ignoreTriggers.includes(triggerCharacter) ? "" : '"';
  const items: vscode.CompletionItem[] = [];

  for (const [key, envs] of keys) {
    const item = new vscode.CompletionItem(
      {
        label: key,
        detail: ` Envpilot: ${resolved.project.projectName}.${envs.join(",")}.${key}`,
      },
      vscode.CompletionItemKind.Variable
    );
    item.insertText = `${triggerCharacter}${quote}${key}${quote}`;
    item.filterText = `${triggerCharacter}${quote}${key}${quote}`;
    item.range = new vscode.Range(
      new vscode.Position(position.line, position.character - 1),
      position
    );
    item.sortText = `0-${resolved.project.projectName}.${key}`;
    items.push(item);
  }

  return items;
}

export interface LanguageSpec {
  languages: string[];
  triggerCharacters: string[];
  match: (linePrefix: string) => string | null;
}

const anchored =
  (...regexes: RegExp[]) =>
  (fallback: string) =>
  (p: string): string | null => {
    for (const re of regexes) {
      const m = re.exec(p);
      if (m) return m[1] ?? fallback;
    }
    return null;
  };

export const LANGUAGE_SPECS: LanguageSpec[] = [
  {
    languages: [
      "javascript",
      "typescript",
      "javascriptreact",
      "typescriptreact",
      "vue",
    ],
    triggerCharacters: ["'", "`", '"', "[", "."],
    match: (p) => {
      if (p.endsWith("process.env.")) return ".";
      return anchored(/process\.env\[(["'`])?$/)("[")(p);
    },
  },
  {
    languages: ["ruby"],
    triggerCharacters: ["'", '"', "["],
    match: anchored(/ENV\[(["'])?$/)("["),
  },
  {
    languages: ["python"],
    triggerCharacters: ["'", '"', "(", "["],
    match: (p) =>
      anchored(/os\.environ\.get\((["'])?$/, /os\.getenv\((["'])?$/)("(")(p) ??
      anchored(/os\.environ\[(["'])?$/)("[")(p),
  },
  {
    languages: ["php"],
    triggerCharacters: ["'", '"', "[", "("],
    match: (p) =>
      anchored(/\$_(?:SERVER|ENV)\[(["'])?$/)("[")(p) ??
      anchored(/getenv\((["'])?$/)("(")(p),
  },
  {
    languages: ["go"],
    triggerCharacters: ["'", '"', "("],
    match: anchored(/os\.Getenv\((["'])?$/)("("),
  },
  {
    languages: ["java"],
    triggerCharacters: ["'", '"', "("],
    match: anchored(/dotenv\.get\((["'])?$/)("("),
  },
  {
    languages: ["csharp"],
    triggerCharacters: ["'", '"', "("],
    match: anchored(/Environment\.GetEnvironmentVariable\((["'])?$/)("("),
  },
  {
    languages: ["rust"],
    triggerCharacters: ["'", '"', "("],
    match: anchored(/std::env::(?:var|var_os)\((["'])?$/)("("),
  },
];

export function registerAutocomplete(
  context: vscode.ExtensionContext,
  deps: IntelliSenseDeps
): void {
  for (const spec of LANGUAGE_SPECS) {
    const provider: vscode.CompletionItemProvider = {
      provideCompletionItems(document, position) {
        const linePrefix = document
          .lineAt(position)
          .text.slice(0, position.character);
        const trigger = spec.match(linePrefix);
        if (trigger === null) {
          return undefined;
        }
        return autocomplete(deps, trigger, document, position);
      },
    };
    for (const language of spec.languages) {
      context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
          { scheme: "file", language },
          provider,
          ...spec.triggerCharacters
        )
      );
    }
  }
}
