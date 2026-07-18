export const diagrams = {
  "the-feature-that-lived-72-days-cost": `flowchart TD
    subgraph P1["Path 1 - hourly cron"]
      C["crons.interval 1 hour"] --> B["buildBaselines"]
      B --> O["organizations.collect()"]
      O --> M["per org: members.collect()"]
      M --> L["per member: 30d auditLogs.collect()"]
      L --> F["JS .filter() by org"]
    end
    subgraph P2["Path 2 - every variable access / security event"]
      V["variable viewed / copied / exported"] --> A["logVariableAccess / logSecurityEvent"]
      A --> S["scheduler.runAfter 0"]
      S --> D["detectAnomaliesAfterAudit"]
      D --> R["6 rules, each a cooldown query"]
      R --> Y["velocity_spike + cross_org_burst<br/>re-scan 60m of auditLogs"]
    end
    style F fill:#e05252,color:#fff
    style Y fill:#e05252,color:#fff
    style A fill:#f0a500,color:#fff`,

  "the-feature-that-lived-72-days-window": `flowchart LR
    T1["03:33:26 · 8615b7b5<br/>delete buildBaselines"] --> T2["03:53:59 · 9b1d4526<br/>bound read costs"]
    T2 --> F1["processRotationExpiry<br/>by_expires_at"]
    T2 --> F2["cleanupExpiredOtps<br/>by_otp_expires"]
    T2 --> F3["projectAccess cleanup<br/>by_active_and_expires"]
    T2 --> F4["cleanupProcessedWebhooks<br/>by_processed_at"]
    style T1 fill:#e05252,color:#fff
    style F1 fill:#3cb371,color:#fff
    style F2 fill:#3cb371,color:#fff
    style F3 fill:#3cb371,color:#fff
    style F4 fill:#3cb371,color:#fff`,

  "the-feature-that-lived-72-days-lifespan": `flowchart LR
    A["Apr 21 · 20f45e43<br/>+1570 lines"] --> B["72 days<br/>zero commits"]
    B --> C["Jul 2 · 8615b7b5<br/>-1570 lines"]
    D["#63 sentry"] --> E["#65 CLI TUI"]
    E --> F["#66 CI publish"]
    F --> G["#67 marketing"]
    G --> H["#69 extension perf"]
    style B fill:#f0a500,color:#fff
    style C fill:#e05252,color:#fff`,
} as const;
