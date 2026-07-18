export const diagrams = {
  "one-token-model-before": `flowchart LR
    GA["GitHub Action"] --> P1["/api/v1/secrets"]
    REST["REST client"] --> P2["/api/v1/*"]
    MCPC["MCP agent"] --> P3["/api/mcp"]
    P1 --> AUP["cicd/pull.ts::_authorizePull"]
    P2 --> AUR["api/authorize.ts::_authorizeRequest"]
    P3 --> AUR
    AUP -->|"by_token_hash"| AK
    AUP -->|"by_token_hash, FALLBACK"| ST["serviceTokens<br/>gate: cicd_service_tokens<br/>UI: Project > Settings > CI/CD Tokens"]
    AUR --> AK["apiKeys<br/>gate: public_api | mcp_server<br/>UI: Organization > Settings > API Keys"]
    TALLY["BEFORE, PRs 101 and 103, 2026-07-11 to 2026-07-18<br/>TWO tables, TWO authorizers, TWO UIs, THREE tier flags"]`,

  "one-token-model-machine-request": `sequenceDiagram
    participant Agent
    participant Envpilot
    participant Reviewer
    Agent->>Envpilot: envpilot_get_variable(STRIPE_KEY)
    Envpilot-->>Agent: denied resource_scope, not in this API key's scope
    Agent->>Envpilot: envpilot_request_variable(project, key, envs, justification)
    Note over Envpilot: 1 consumeRateLimit(machineRequestCreate)<br/>5/hr, burst 2, keyed by tokenHash<br/>2 _authorizeRequest{resource: requests}<br/>3 projects.getBySlug -> projectId<br/>4 _authorizeRequest{..., projectId}<br/>5 env scope subset of scopeEnvironments<br/>6 _createFromKey: key live? open under 5?<br/>no rejection in last 24h?<br/>7 insertRequest (SHARED with human path)<br/>findEnvironmentConflicts, dedupe<br/>vaultRef = undefined -- VALUELESS
    Envpilot-->>Agent: {requestId, status: pending, message}
    Envpilot->>Reviewer: email and dashboard badge
    Note over Reviewer: Sees the originating API key name<br/>and TYPES the secret value
    Reviewer->>Envpilot: approveWithValue(value)
    Envpilot->>Envpilot: encrypt -> _approveWithSuppliedRef
    Agent->>Envpilot: envpilot_get_request_status(requestId)
    Envpilot-->>Agent: {requestId, key, environments, status, reviewReason, createdAt} (array)
    Note over Agent,Envpilot: Never vaultRef
    Note over Envpilot,Reviewer: If nobody reviews, a daily cron at 03:30 UTC<br/>cancels machine pendings older than 30 days`,
} as const;
