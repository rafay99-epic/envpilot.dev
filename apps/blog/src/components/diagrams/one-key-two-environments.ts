export const diagrams = {
  "one-key-two-environments-redaction-chain": `flowchart TD
    T["convex mutation<br/>throw new Error(&quot;…already exists…&quot;)"] --> X{"Convex transport"}
    X -->|"dev deployment"| D1["message preserved<br/>&quot;…already exists…&quot;"]
    X -->|"prod deployment"| P1["message REDACTED<br/>&quot;Server Error&quot;"]
    D1 --> D2["api/variables/route.ts<br/>sanitizeConvexError(error)"]
    P1 --> P2["api/variables/route.ts<br/>sanitizeConvexError(error)"]
    D2 -->|"includes(&quot;already exists&quot;) TRUE"| D3["HTTP 409"]
    P2 -->|"includes(&quot;already exists&quot;) FALSE"| P3["HTTP 500 generic"]
    D3 --> DU["projects/[slug]/page.tsx<br/>isDuplicateKey = 409 and /already exists/"]
    P3 --> PU["projects/[slug]/page.tsx<br/>same check, neither half matches"]
    DU --> D4["friendly inline banner<br/>drawer stays open"]
    PU --> P4["&quot;Failed to create variable&quot;<br/>drawer state wrong"]
    D4 --> D5["PR #110 fix works"]
    P4 --> P5["PR #110 fix never fires"]`,

  "one-key-two-environments-vault-orphan": `flowchart TD
    subgraph B["BEFORE #117"]
      B1["action createWithValue"] --> B2["vault.createSecret to WorkOS<br/>ref = vs_abc123"]
      B2 --> B3["runMutation variables.create"]
      B3 -->|"duplicate key throws"| B4["ORPHAN: vs_abc123 in Vault<br/>referenced by no Convex row"]
      B4 --> B5["one orphan per failed import row"]
    end
    subgraph A["AFTER #117"]
      A1["action createWithValue"] --> A2{"runQuery<br/>getEnvironmentConflictsInternal"}
      A2 -->|"conflicts"| A3["throw ConvexError<br/>NOTHING WRITTEN"]
      A2 -->|"clear"| A4["vault.createSecret to WorkOS<br/>ref = vs_abc123"]
      A4 --> A5["try runMutation variables.create<br/>race backstop re-checks"]
      A5 -->|"throws"| A6["catch: vault.deleteSecret(ref)<br/>then rethrow"]
      A5 -->|"ok"| A7["no orphan on the common path"]
    end`,

  "one-key-two-environments-write-paths": `flowchart LR
    C1["web drawer<br/>REST /api/variables"] --> W1["variables.mutations.create"]
    C2["web value path<br/>CLI push / import"] --> W2["values.createWithValue (ACTION)<br/>getEnvironmentConflictsInternal"]
    C3["environment edit"] --> W3["variables.mutations.update"]
    C4["envpilot request"] --> W4["requests.mutations.create"]
    C5["reviewer approve"] --> W5["requests.mutations.review"]
    C6["trash restore"] --> W6["variables.mutations.restore (#118)"]
    W1 --> H["findEnvironmentConflicts()<br/>convex/features/variables/helpers.ts"]
    W2 -->|"pre-check BEFORE vault"| H
    W3 -->|"excludeVariableId"| H
    W4 --> H
    W5 -->|"approvedEnvironments may be a subset"| H
    W6 -->|"the missed path: writes nothing,<br/>clears deletedAt"| H
    H --> I["INVARIANT: every (key, environment)<br/>resolves to AT MOST ONE active variable"]`,
} as const;
