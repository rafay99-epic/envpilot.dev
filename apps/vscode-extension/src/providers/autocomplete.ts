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

/**
 * Resolve the linked project (and the environments of the containing linked
 * directory) for a document, via directory containment against the locally
 * stored links. Purely local — no network.
 */
export async function resolveProjectForDocument(
  storage: StorageService,
  documentPath: string
): Promise<{ project: LinkedProjectV2; environments: string[] } | null> {
  const docDir = path.dirname(documentPath);
  for (const project of await storage.getLinkedProjectsV2()) {
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

/**
 * Unique variable key names across the given environments, mapped to the
 * environments each key exists in. Metadata-only (no values, no export audit);
 * ApiService caches responses for 30s with single-flight, so per-keystroke
 * calls never fan out into network requests.
 */
export async function fetchKeyEnvironments(
  api: ApiService,
  project: LinkedProjectV2,
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
  const resolved = await resolveProjectForDocument(
    deps.storage,
    document.uri.fsPath
  );
  if (!resolved) {
    return null;
  }

  const keys = await fetchKeyEnvironments(
    deps.api,
    resolved.project,
    resolved.environments
  );

  const ignoreTriggers = ["'", "`", '"', "."];
  // JS-style `process.env.` references take no quotes; every other trigger
  // (bracket/call syntax) re-inserts a quoted key.
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
    // Range picks up the trigger character as prefix to fix VS Code's fuzzy
    // scoring when sorting.
    item.range = new vscode.Range(
      new vscode.Position(position.line, position.character - 1),
      position
    );
    // "0-" prefix sorts every secret above all other suggestions; VS Code
    // then sorts alphabetically by label.
    item.sortText = `0-${resolved.project.projectName}.${key}`;
    items.push(item);
  }

  return items;
}

interface LanguageSpec {
  languages: string[];
  triggerCharacters: string[];
  /** Trigger character to complete with, or null when the prefix doesn't match. */
  match: (linePrefix: string) => string | null;
}

const LANGUAGE_SPECS: LanguageSpec[] = [
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
      if (/.*?process\.env\[(["'`])?/.test(p)) return p.slice(-1);
      return null;
    },
  },
  {
    languages: ["ruby"],
    triggerCharacters: ["'", '"', "["],
    match: (p) => (/.*?ENV\[(["'])?/.test(p) ? p.slice(-1) : null),
  },
  {
    languages: ["python"],
    triggerCharacters: ["'", '"', "(", "["],
    match: (p) =>
      /.*?os\.environ.get\((["'])?/.test(p) ||
      /.*?os\.getenv\((["'])?/.test(p) ||
      /.*?os\.environ\[(["'])?/.test(p)
        ? p.slice(-1)
        : null,
  },
  {
    languages: ["php"],
    triggerCharacters: ["'", '"', "[", "("],
    match: (p) =>
      /.*?\$_SERVER\[(["'])?/.test(p) ||
      /.*?\$_ENV\[(["'])?/.test(p) ||
      /.*?getenv\((["'])?/.test(p)
        ? p.slice(-1)
        : null,
  },
  {
    languages: ["go"],
    triggerCharacters: ["'", '"', "("],
    match: (p) => (/.*?os\.Getenv\((["'])?/.test(p) ? p.slice(-1) : null),
  },
  {
    languages: ["java"],
    triggerCharacters: ["'", '"', "("],
    match: (p) => (/.*?dotenv\.get\((["'])?/.test(p) ? p.slice(-1) : null),
  },
  {
    languages: ["csharp"],
    triggerCharacters: ["'", '"', "("],
    match: (p) =>
      /.*?Environment\.GetEnvironmentVariable\((["'])?/.test(p)
        ? p.slice(-1)
        : null,
  },
  {
    languages: ["rust"],
    triggerCharacters: ["'", '"', "("],
    match: (p) =>
      /.*?std::env::var\((["'])?/.test(p) ||
      /.*?std::env::var_os\((["'])?/.test(p)
        ? p.slice(-1)
        : null,
  },
];

/** Language ids the IntelliSense providers cover (shared with the hover). */
export const INTELLISENSE_LANGUAGES = LANGUAGE_SPECS.flatMap(
  (spec) => spec.languages
);

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
