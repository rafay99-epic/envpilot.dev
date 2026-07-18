export const diagrams = {
  "deleting-backwards-compatibility-version-manifest": `flowchart TD
    V["versions.ts<br/>APP_VERSIONS"] --> R["app/api/version/route.ts<br/>NextResponse.json(APP_VERSIONS)"]
    P["proxy.ts unauthenticatedPaths<br/>includes /api/version"] -->|"without it: 302 to WorkOS HTML,<br/>checks no-op"| R
    R --> G["GET /api/version<br/>public JSON"]
    G --> C["CLI: lib/version-check.ts<br/>enforceVersion in preAction"]
    G --> X["VS Code: services/versionCheck.ts<br/>checkForUpdate"]
    G --> W["Web: dashboard/update-banner.tsx"]
    C -->|"blocked"| CB["printHardBlock, exit 1"]
    X -->|"blocked"| XB["outdated latch, setContext, modal<br/>wrapCommand refuses every command"]
    W --> WS["soft notice only"]`,

  "deleting-backwards-compatibility-enforce-version": `flowchart TD
    S["envpilot cmd"] --> H["preAction hook"]
    H --> E["enforceVersion"]
    E --> F{"cache state"}
    F -->|"fresh, under 1h"| D["decide from disk<br/>no network"]
    F -->|"stale with data"| D2["decide from disk,<br/>void refreshCache in background"]
    F -->|"stale, no data"| D3["await refreshCache<br/>3s cap, timer unref'd"]
    D --> EV["evaluateVersion"]
    D2 --> EV
    D3 --> EV
    EV -->|"current below min"| B["hard block, exit 1"]
    EV -->|"current below latest"| N["soft notice, proceed"]
    EV -->|"otherwise"| OK["proceed"]
    E -->|"throw: corrupt cache, disk error"| FO["catch returns false<br/>FAIL OPEN, never blocks"]`,

  "deleting-backwards-compatibility-shim-lifecycle": `flowchart TD
    A["PR #95, 2026-07-10<br/>convex restructured, root shims born"] --> A2["re-export only, keeps<br/>variables:listWithAccess alive"]
    A2 --> G1{"gate 1: npm has @envpilot/cli 1.18.0?"}
    G1 -->|"yes"| G2{"gate 2: Open VSX has extension 1.15.0?"}
    G2 -->|"yes"| G3{"gate 3: convex logs show zero calls<br/>to variables:* / projects:*?"}
    G3 -->|"yes"| M["PR #131, 2026-07-17<br/>minCli 1.18.0, minExtension 1.15.0"]
    M --> D["11 shims deleted<br/>213 lines across 17 files"]
    M --> U["older builds get an upgrade prompt,<br/>not a stack trace"]`,
} as const;
