export const diagrams = {
  "billing-when-stripe-is-not-an-option-trust-boundary": `flowchart TD
    P["Polar sends event"] --> R["POST /api/webhooks/polar"]
    R --> V["validateEvent(body, headers, secret)"]
    V --> A["processWebhookEvent (public action)"]
    X["Anyone with NEXT_PUBLIC_CONVEX_URL"] -->|"forged subscription.active"| A
    A --> G["bridgeSecret check<br/>timingSafeEqual vs env var"]
    G -->|"match"| OK["dispatch to internal mutations"]
    G -->|"no match or var unset"| D["throw, refuse the event"]
    style V fill:#3cb371,color:#fff
    style X fill:#e05252,color:#fff
    style G fill:#3cb371,color:#fff
    style D fill:#f0a500,color:#fff`,

  "billing-when-stripe-is-not-an-option-ack200": `flowchart TD
    C["Customer pays"] --> E["Polar emits subscription.active"]
    E --> R["Route returns 200 immediately"]
    R --> H["activateSubscriptionFromEvent"]
    H --> M["Product not seeded in paymentProducts"]
    M -->|"old: mapProductIdToTier"| F["falls back to default tier: free"]
    F --> L["console.error, then nothing"]
    L --> T["Paid: yes / Tier: free / Retry: never"]
    M -->|"new: mapProductIdToTierStrict"| TH["throw, action rejects"]
    TH --> R5["Route returns 500"]
    R5 --> RD["Polar redelivers with backoff"]
    style T fill:#e05252,color:#fff
    style F fill:#f0a500,color:#fff
    style TH fill:#3cb371,color:#fff
    style RD fill:#3cb371,color:#fff`,

  "billing-when-stripe-is-not-an-option-113-days": `flowchart LR
    A["2026-03-19<br/>SECURITY-TODO filed<br/>Critical, unchecked"] --> B["2026-03-21<br/>PR 45 merged<br/>Stripe to Polar"]
    B --> C["2026-03-22<br/>PR 48<br/>event-ordering race"]
    C --> D["2026-04-05<br/>PR 49 (+3813)<br/>then PR 50 to main"]
    D --> E["2026-04-18<br/>file moved to docs/<br/>box still unchecked"]
    E --> F["2026-07-10<br/>PR 99<br/>box finally checked"]
    style A fill:#e05252,color:#fff
    style E fill:#f0a500,color:#fff
    style F fill:#3cb371,color:#fff`,
} as const;
