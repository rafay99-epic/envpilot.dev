export const diagrams = {
  "the-extension-that-leaked-uninstall-hole": `flowchart LR
    I["install"] --> S["sign in"]
    S --> Y["sync"]
    Y --> U["uninstall"]
    U -->|"nothing left running to clean up"| D["~/project/.env still on disk<br/>plaintext, forever"]`,

  "the-extension-that-leaked-purge-guards": `flowchart TD
    F["File F in manifest<br/>window W closing"] --> SC{"SCOPE<br/>F under a workspace folder of W?"}
    SC -->|"no"| KEEP["keep"]
    SC -->|"yes"| OO{"OPT-OUT<br/>project autoUnsyncOnClose is false?"}
    OO -->|"yes"| KEEP
    OO -->|"no"| NE{"Nested opt-out wins<br/>F under any opted-out project?"}
    NE -->|"yes"| KEEP
    NE -->|"no"| LW{"LIVE-WINDOW GUARD<br/>folder claimed by another live<br/>extension host pid?"}
    LW -->|"yes"| KEEP
    LW -->|"no"| RD["read F"]
    RD -->|"ENOENT"| DROP["drop stale manifest entry"]
    RD -->|"sha256 mismatch"| SP["THE HASH GUARD<br/>spared++"]
    RD -->|"sha256 match"| DEL["chmod 0o644, unlink<br/>deleted++"]`,
} as const;
