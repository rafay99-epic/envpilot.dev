export const diagrams = {
  "one-secret-guarded-everything-before": `flowchart TD
    B["Admin SPA<br/>zustand, in-memory"] --> S["secret as a plain<br/>function argument"]
    S --> V["verifyAdmin(secret)<br/>string compare"]
    V --> C["60 call sites<br/>15 files"]
    CI["GitHub Actions"] --> G["convex env get ADMIN_SECRET"]
    G --> J["jq marshals it into JSON"]
    J --> M["runMigration(secret, name)"]
    M --> C
    NET["The public internet"] --> O["verifySecret query<br/>returns {valid: bool}"]
    O -.->|"brute-force oracle"| V
    style O fill:#e05252,color:#fff
    style NET fill:#e05252,color:#fff
    style V fill:#f0a500,color:#fff`,

  "one-secret-guarded-everything-after": `flowchart TD
    B["Admin SPA"] --> A["AuthKit login"]
    A --> T["WorkOS JWT"]
    T --> P["ConvexProviderWithAuth"]
    P --> K["Convex verifies vs<br/>auth.config.ts JWKS"]
    K --> U["getAuthedUser(ctx)"]
    U --> L["ADMIN_EMAILS allowlist"]
    L --> R["requireAdmin(ctx)<br/>returns the admin row"]
    R --> C["58 call sites<br/>14 files"]
    CI["GitHub Actions<br/>deploy key"] --> I["internal migrations:run"]
    I --> C
    style R fill:#3cb371,color:#fff
    style L fill:#3cb371,color:#fff
    style I fill:#3cb371,color:#fff`,

  "one-secret-guarded-everything-allowlist": `flowchart LR
    P["Admin panel<br/>data browser"] --> T["BROWSABLE_TABLES<br/>31 tables, incl. users"]
    T --> D[("Convex database")]
    P -.->|"cannot reach"| E["ADMIN_EMAILS<br/>Convex deployment env"]
    E --> R["requireAdmin(ctx)"]
    style E fill:#3cb371,color:#fff
    style T fill:#f0a500,color:#fff`,
} as const;
