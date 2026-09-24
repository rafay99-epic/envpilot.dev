import type { Uri, Event } from "vscode";

export interface GitExtension {
  getAPI(version: 1): API;
}

export interface API {
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
}

export interface RepositoryState {
  readonly indexChanges: Change[];
  readonly onDidChange: Event<void>;
}

export interface Change {
  readonly uri: Uri;
  readonly status: number;
}
