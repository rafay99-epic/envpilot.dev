export const diagrams = {
  "six-prs-to-find-one-bug-value-chain": `flowchart TD
    ENV["CI project env<br/>WORKOS_CLIENT_ID<br/>NEXT_PUBLIC_CONVEX_URL"]
    ENV --> S1["1. step shell<br/>bun run package"]
    S1 -->|"esbuild define, silent"| DIST["dist/extension.js"]

    DIST --> V["2. vsce package"]
    V --> PRE["npm run vscode:prepublish"]
    PRE --> MJS["node scripts/prepublish.mjs"]
    MJS -->|"rebuilds, blind"| PKG["npm run package"]
    PKG --> VSIX["envpilot-1.15.0.vsix<br/>extension/dist/extension.js"]

    VSIX --> C3["3. checksum<br/>unzip -p piped into shasum"]
    VSIX --> C4["4. embed check<br/>capture into a shell var, then grep"]
    C3 -->|"passed"| NOTE["Same bytes.<br/>One pipes, one captures."]
    C4 -->|"failed"| NOTE`,
} as const;
