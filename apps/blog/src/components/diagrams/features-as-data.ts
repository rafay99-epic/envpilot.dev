export const diagrams = {
  "features-as-data-resolver": `flowchart TD
    A["checkBooleanFeature(db, orgId, key)"] --> B["resolveOrgGateContext"]
    B --> C{"adminSettings.tierEnforcement<br/>ENFORCE_TIER_LIMITS"}
    C -->|"off (or missing)"| D["true / null<br/>tierName: &quot;unlimited&quot;"]
    C -->|"on"| E["featureRegistry.by_key"]
    E --> F{"found and isActive?"}
    F -->|"no"| G["false<br/>tierName: &quot;unknown&quot;"]
    F -->|"yes"| H["org.createdBy -> userTiers"]
    H --> I["grace period override<br/>-> effectiveTier"]
    I --> J["tierFeatures[effectiveTier][key]"]
    J --> K["fallback: registry.defaultValue"]
    K --> L["parseFeatureValue(raw, valueType)"]
    style D fill:#f0a500,color:#fff
    style G fill:#e05252,color:#fff
    style L fill:#3cb371,color:#fff
  `,
  "features-as-data-dual-gate": `flowchart TD
    A["createVariable<br/>rotationFrequencyDays > 0"] --> B["checkBooleanFeature<br/>&quot;secret_rotation&quot;"]
    B -->|"denied"| X["throw: upgrade required"]
    B -->|"allowed"| C["checkCountedLimit<br/>&quot;secret_rotation_limit&quot;"]
    C -->|"limit === null"| D["allowed, countFn never runs"]
    C -->|"limit is a number"| E["countRotationEnabledVariables<br/>fan-out over projects"]
    E --> F{"count < limit?"}
    F -->|"no"| X
    F -->|"yes"| G["variable written"]
    G --> H["hourly cron scan<br/>+ Resend reminder emails"]
    I["OrgGateContext resolved once<br/>PR #81: was 2 reads, now 1"] -.-> B
    I -.-> C
    style X fill:#e05252,color:#fff
    style D fill:#3cb371,color:#fff
    style H fill:#f0a500,color:#fff
  `,
  "features-as-data-checklist": `flowchart LR
    A["convex/lib/seedData.ts<br/>1 SEED_FEATURES entry"] --> B["admin/migrations.ts<br/>2 lines in tierConfigs"]
    B --> C["mutation<br/>checkBooleanFeature(...)"]
    C --> D["FeatureGate featureKey<br/>or queries.checkFeature"]
    D --> E["deploy-convex.yml<br/>seed loop on every deploy"]
    E --> F["remove a feature<br/>no prune path exists"]
    style A fill:#3cb371,color:#fff
    style B fill:#3cb371,color:#fff
    style C fill:#3cb371,color:#fff
    style D fill:#3cb371,color:#fff
    style E fill:#3cb371,color:#fff
    style F fill:#e05252,color:#fff
  `,
} as const;
