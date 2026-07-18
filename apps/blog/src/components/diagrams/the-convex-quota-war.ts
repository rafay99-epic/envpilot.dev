export const diagrams = {
  "the-convex-quota-war-read-fanout": `flowchart LR
    B["Browser: one dashboard tab, any page"]

    B --> N["Global nav"]
    N --> TS["useTierStoreSync"]
    TS -->|"re-runs on every variable write, per tab"| EU["getExtendedUsage<br/>~2000 variable docs<br/>+ per-project share / rotation / account counts"]

    B --> OS["Org switcher"]
    OS -->|"re-runs every navigation, found in #109"| API["fetch /api/organizations"]
    API --> BADGE["OrgProBadge, per dropdown row"]
    BADGE --> RF["getResolvedFeatures<br/>~60 docs each"]

    B --> PB["Page body"]
    PB -->|"one per feature key, found in #109"| CF["2-5 x checkFeature"]

    B --> PL["Project list"]
    PL -->|"just for a count"| COL[".collect() all variables per project,<br/>including soft-deleted trash"]

    B --> DR["VariableCreateDrawer isOpen=false<br/>mounted, closed, invisible"]
    DR --> CTL["checkTierLimit"]
    CTL -->|"re-runs on every write"| LC["Live variable count"]`,
} as const;
