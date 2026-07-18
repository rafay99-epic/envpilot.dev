export const diagrams = {
  "the-ci-round-trip-billing": `flowchart TD
    subgraph A["Before #115 — 13 jobs"]
      A1["changes"] --> A2["format"]
      A1 --> A3["6 per-package checks"]
      A1 --> A4["react-doctor"]
      A2 --> A5["checks-passed"]
      A3 --> A5
      A4 --> A5
      A5 --> A6["build-cli + build-extension"]
      A6 --> A7["~15 billed min per push"]
    end
    subgraph B["After #115 — 3 jobs"]
      B1["changes"] --> B2["checks<br/>one checkout, one install"]
      B0[".turbo cache"] --> B2
      B2 --> B3["checks-passed"]
      B3 --> B4["~3-6 billed min per push"]
    end
    subgraph C["CircleCI v2 — generated"]
      C1["detect, ~15s, small class"] -.->|"generates workflow"| C2["quality + changed surfaces"]
      C2 --> C3["zero ghost jobs"]
    end
    style A7 fill:#e05252,color:#fff
    style B4 fill:#f0a500,color:#fff
    style C3 fill:#3cb371,color:#fff`,

  "the-ci-round-trip-loop": `flowchart LR
    N1["5 workflow files"] -->|"#61: too many files"| N2["ci-deploy.yml, 697 lines"]
    N2 -->|"#74: reuse"| N3["ci.yml + reusables"]
    N3 -->|"#115: minutes gone, day 12"| N4["ci.yml, 3 jobs on a PR"]
    N4 -->|"#116: billing unpaid"| N5["CircleCI v1"]
    N5 -->|"#119: ghost jobs, 2h later"| N6["CircleCI v2, dynamic"]
    N6 -->|"#139: MIT, minutes free"| N4
    N6 -.->|"#148: 17h deployed nowhere"| N7["Vercel deploys re-enabled"]
    style N4 fill:#3cb371,color:#fff
    style N5 fill:#f0a500,color:#fff
    style N7 fill:#e05252,color:#fff`,

  "the-ci-round-trip-detect": `flowchart TD
    R["Same path rules on both sides"] --> L1
    R --> G1
    L1["CircleCI: hit() grep regexes"] --> L2["boolean surface vars"]
    L2 --> L3["append workflow to /tmp/continue.yml"]
    L3 --> L4["circleci/continuation orb"]
    G1["Actions: dorny/paths-filter@v3"] --> G2["bool() merges shared flag"]
    G2 --> G3["flags into GITHUB_OUTPUT"]
    G3 --> G4["if: on each job, skipped is free"]
    style R fill:#3cb371,color:#fff
    style L3 fill:#f0a500,color:#fff
    style G4 fill:#3cb371,color:#fff`,
} as const;
