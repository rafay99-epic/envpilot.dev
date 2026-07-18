export const diagrams = {
  "the-mobile-app-that-never-shipped-two-auths": `flowchart TD
    subgraph MERGED["Merged: one enforcement core"]
      K["Bearer key"] --> H["SHA-256 hash"]
      H --> T["apiKeys.by_token_hash"]
      T --> A["_authorizeRequest"]
      A --> OK["ok: scopeProjects<br/>scopeEnvironments<br/>scopeResources, keyId"]
      A --> D["Denials: invalid_key<br/>resource_scope, project_scope<br/>surface_scope, tier_gate"]
      OK --> S["REST / MCP / GitHub Action"]
    end
    subgraph BRANCH["Branch: PR 64"]
      M["mob_ token"] --> P["mobileTokens.by_access_token<br/>plaintext, indexed"]
      P --> V["validateToken"]
      V --> R["valid: true, userId"]
      R --> VR["POST /api/mobile/vault<br/>decrypts any vaultRef"]
      C["ConvexReactClient"] --> DB["Convex queries<br/>no auth at all"]
    end
    style A fill:#3cb371,color:#fff
    style OK fill:#3cb371,color:#fff
    style D fill:#f0a500,color:#fff
    style P fill:#e05252,color:#fff
    style VR fill:#e05252,color:#fff
    style DB fill:#e05252,color:#fff`,

  "the-mobile-app-that-never-shipped-composition": `flowchart LR
    B["PR 64 branch<br/>+22,941 / -65"] --> AG[".agents/ vendored docs<br/>87 files, +13,057 — 57%"]
    B --> MO["apps/mobile/<br/>57 files, +7,779 — 34%"]
    B --> LK["bun.lock<br/>+1,464"]
    B --> WEB["apps/web/ auth surface<br/>4 files, +393"]
    B --> CVX["convex/<br/>3 files, +219"]
    style AG fill:#f0a500,color:#fff
    style WEB fill:#e05252,color:#fff
    style CVX fill:#e05252,color:#fff`,

  "the-mobile-app-that-never-shipped-timeline": `flowchart LR
    D1["2026-05-08<br/>PR 64 opened<br/>surface 4 proposed"] --> D2["2026-06-07<br/>commit 4bcb31e5<br/>last code"]
    D2 --> D3["2026-07-06<br/>PR last touched"]
    D3 --> D4["2026-07-18 15:33<br/>PR 146 merges<br/>surfaces field"]
    D4 --> D5["2026-07-18 15:38<br/>PR 147 merges<br/>serviceTokens deleted"]
    D5 --> D6["architecture.mdx<br/>five surfaces<br/>mobile is not one"]
    style D1 fill:#f0a500,color:#fff
    style D4 fill:#3cb371,color:#fff
    style D5 fill:#3cb371,color:#fff
    style D6 fill:#e05252,color:#fff`,
} as const;
