export const diagrams = {
  "the-test-gate-we-switched-off-chain": `flowchart TD
    A["changes"] --> B["checks-passed"]
    B --> C["e2e gate (Playwright)"]
    C --> D["Deploy Convex"]
    D --> E["Deploy CLI"]
    D --> F["Deploy extension"]
    E --> G["Deploy Homebrew formula"]
    G --> H["GitHub Release"]
    F --> H
    style A fill:#3cb371,color:#fff
    style B fill:#3cb371,color:#fff
    style C fill:#e05252,color:#fff
    style D fill:#f0a500,color:#fff
    style E fill:#f0a500,color:#fff
    style F fill:#f0a500,color:#fff
    style G fill:#f0a500,color:#fff
    style H fill:#f0a500,color:#fff`,

  "the-test-gate-we-switched-off-key": `flowchart TD
    A["Add Variable drawer opens"] --> B{"varBlocked?"}
    B -->|"under the cap"| C["VariableForm renders #key"]
    B -->|"at 50 of 50"| D["UpgradePrompt<br/>You have reached the variable limit."]
    E["Playwright waits on<br/>getByRole(dialog).locator(#key)"] -.-> C
    D --> F["#key never exists<br/>locator times out"]
    style C fill:#3cb371,color:#fff
    style D fill:#f0a500,color:#fff
    style F fill:#e05252,color:#fff`,

  "the-test-gate-we-switched-off-ratchet": `flowchart TD
    A["spec fails"] --> B["its finally cleanup is skipped"]
    B --> C["stale E2E_* rows survive"]
    C --> D["active variable count climbs"]
    D --> E["count hits 50 of 50"]
    E --> F["drawer renders UpgradePrompt"]
    F --> A
    G["cleanup.setup.ts pre-run sweep"] --> C
    H["STALE_AGE_MS = 30 min guard<br/>spares a concurrent run"] --> G
    style A fill:#e05252,color:#fff
    style F fill:#e05252,color:#fff
    style G fill:#3cb371,color:#fff
    style H fill:#f0a500,color:#fff`,
} as const;
