export const diagrams = {
  "one-core-three-faces-authorize-pipeline": `flowchart TD
    T["Authorization: Bearer envpk_ plus 40 hex"] --> F["assertKeyFormat<br/>cheap reject before hashing"]
    F --> H["hashToken SHA-256<br/>plaintext never stored or logged"]
    H --> R["consumeRateLimit by hash<br/>invalid keys burn budget too,<br/>deliberately outside the core"]
    R --> C["_authorizeRequest<br/>internalMutation, an atomic write"]
    C -->|"no row"| NK["invalid_key<br/>no audit: no org to attribute to"]
    C -->|"revoked"| IK["audit write<br/>invalid_key"]
    C -->|"expired"| IK
    C -->|"bad surface"| SS["audit write<br/>surface_scope"]
    C -->|"bad scope"| PS["audit write<br/>resource, environment<br/>or project_scope"]
    C -->|"gate off"| TG["audit write<br/>tier_gate"]
    IK --> D["denial returned"]
    SS --> D
    PS --> D
    TG --> D
    D -.-> N["RETURNED, never thrown: a throw rolls back<br/>the mutation and the denial audit row with it"]
    C -->|"ok"| P["lastUsedAt patch if over 60s stale<br/>+ audit"]
    P --> B["bounded read<br/>take MAX_PULL_ROWS + 1"]
    B -->|"more than 1000 rows"| O["throw: 422 OVERFLOW<br/>never partial"]
    B -->|"vault decrypt fails"| X["throw: 503 DECRYPT_FAILED<br/>never a sentinel"]
    B -->|"within cap"| OK["rows returned"]`,
  "one-core-three-faces-core-fork": `flowchart LR
    REST["REST client"] --> V1["/api/v1/**"]
    MCPC["MCP client"] --> MCPR["/api/mcp"]
    V1 --> RD["api/reads.ts"]
    MCPR --> RD
    RD --> CORE["_authorizeRequest<br/>the core"]
    GA["GitHub Action"] --> SEC["/api/v1/secrets"]
    SEC --> PULL["cicd/pull.ts<br/>_authorizePull"]
    PULL --> DUP["re-implements the same checks"]
    PULL -.->|"does NOT call it"| CORE`,
} as const;
