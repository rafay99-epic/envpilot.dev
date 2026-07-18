export const diagrams = {
  "how-our-own-auth-hid-us-from-google-funnel": `flowchart TD
    REQ["Incoming request"] --> M{"config.matcher &mdash; reaches middleware?"}
    M -->|"static file or _next"| SKIP["Served directly"]
    M -->|"everything else"| U{"in unauthenticatedPaths?"}
    U -->|"hit"| OK["200 &mdash; page renders"]
    U -->|"miss, the DEFAULT"| DENY["307 to WorkOS sign-in"]
    DENY --> V1["GET /faq from a crawler"]
    DENY --> V2["GET /feed.xml from a crawler"]
    DENY --> V3["GET /api/version from the CLI"]
    style OK fill:#3cb371,color:#fff
    style SKIP fill:#3cb371,color:#fff
    style DENY fill:#e05252,color:#fff
    style V1 fill:#f0a500,color:#fff
    style V2 fill:#f0a500,color:#fff
    style V3 fill:#f0a500,color:#fff`,

  "how-our-own-auth-hid-us-from-google-invisible": `flowchart TD
    G["Googlebot"] --> A["GET /faq"]
    G --> B["GET /pricing"]
    A --> A1["307 to WorkOS sign-in"]
    A1 --> A2["Nothing to index"]
    A2 --> A3["Shows up as &quot;Page with redirect&quot;"]
    B --> B1["200 OK, real content"]
    B1 --> B2["canonical points at the homepage"]
    B2 --> B3["Folded into /"]
    B3 --> B4["Shows up as &quot;Duplicate&quot;"]
    A3 --> R["Search Console: 1 indexed, 3 excluded"]
    B4 --> R
    style A1 fill:#e05252,color:#fff
    style A2 fill:#e05252,color:#fff
    style B1 fill:#3cb371,color:#fff
    style B2 fill:#f0a500,color:#fff
    style B3 fill:#f0a500,color:#fff
    style R fill:#e05252,color:#fff`,

  "how-our-own-auth-hid-us-from-google-timeline": `flowchart LR
    P38["PR #38, Mar 18<br/>add /sitemap.xml + /robots.txt<br/>after 401s in Search Console"]
    P67["PR #67, Jun 12<br/>add /faq, /docs, /feed.xml,<br/>/llms*.txt, /api/auth/me"]
    P89["PR #89, Jul 6<br/>add /api/version<br/>enforcement was silently dead"]
    P116["PR #116, Jul 16<br/>REMOVE /docs, /feed.xml, /llms*.txt<br/>moved to a middleware-free app"]
    P38 --> P67 --> P89 --> P116
    style P38 fill:#f0a500,color:#fff
    style P67 fill:#e05252,color:#fff
    style P89 fill:#f0a500,color:#fff
    style P116 fill:#3cb371,color:#fff`,
} as const;
