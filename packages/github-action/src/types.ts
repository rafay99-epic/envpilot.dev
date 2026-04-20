// ─── Action Inputs ───────────────────────────────────────────────────────────

export type AuthMethod = "service-token" | "oidc";
export type ExportTarget = "env" | "outputs" | "both";

export interface ActionInputs {
  method: AuthMethod;
  serviceToken: string;
  projectId: string;
  environment: string;
  apiUrl: string;
  exportTo: ExportTarget;
  maskValues: boolean;
  keys: string[];
}

// ─── API Request / Response Types ────────────────────────────────────────────

export interface ExchangeRequest {
  method: AuthMethod;
  serviceToken?: string;
  oidcToken?: string;
  projectId: string;
  environments: string[];
  githubRepository?: string;
  githubWorkflow?: string;
  githubRunId?: string;
  githubActor?: string;
  githubRef?: string;
}

export interface ExchangeResponse {
  sessionToken: string;
  sessionId: string;
  expiresAt: number;
}

export interface SecretEntry {
  key: string;
  value: string;
  environment: string;
  description?: string;
  isSensitive: boolean;
}

export interface SecretsResponse {
  variables: SecretEntry[];
  decryptionFailures: string[];
}

export interface CompleteSessionRequest {
  variablesAccessed: number;
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export class EnvpilotApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string | undefined;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.name = "EnvpilotApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

// ─── State keys shared between main and post steps ───────────────────────────

export const STATE_KEYS = {
  SESSION_ID: "session-id",
  SESSION_TOKEN: "session-token",
  API_URL: "api-url",
  VARIABLES_ACCESSED: "variables-accessed",
} as const;
