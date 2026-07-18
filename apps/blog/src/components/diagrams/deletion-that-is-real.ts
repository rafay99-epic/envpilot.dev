export const diagrams = {
  "deletion-that-is-real-shared-vaultref": `flowchart LR
    subgraph CX["Convex"]
      EV["environmentVariables.vaultRef"]
      V1["variableVersions v1"]
      V2["variableVersions v2"]
      V3["variableVersions v3"]
    end
    OBJ["WorkOS Vault obj_abc<br/>value = &quot;v3&quot;<br/>v1 and v2 values gone"]
    EV --> OBJ
    V1 --> OBJ
    V2 --> OBJ
    V3 --> OBJ
    NOTE["updateSecret overwrote<br/>the object in place"] -.-> OBJ
    V1 -.->|"rollback patches vaultRef to obj_abc"| EV
    EV -.-> CLAIM["UI reports restored<br/>nothing moved"]`,
  "deletion-that-is-real-trash-gc": `flowchart TD
    DEL["user clicks Delete"] --> SOFT["patch deletedAt = now<br/>rows hidden, Vault object untouched"]
    SOFT -->|"within 7 days"| RES["restore()"]
    RES --> GUARD["guard: past the window then refuse<br/>purge-eligible means un-restorable,<br/>so GC cannot race a restore"]
    SOFT -->|"or Empty trash"| ET["emptyProjectTrash()<br/>same ordering"]
    SOFT -->|"after 7 days"| CRON["cron 04:00 UTC<br/>purgeExpiredBatch(depth)"]
    CRON -->|"WORKOS_API_KEY unset"| ABORT["abort, 0 rows deleted"]
    CRON --> LIST["listPurgeEligible()<br/>by_deleted_at, gt 0 to lt cutoff, take 25"]
    LIST --> REFS["refs = Set of variable.vaultRef<br/>plus every version vaultRef"]
    REFS --> HTTP["DELETE api.workos.com/vault/v1/kv/ref"]
    HTTP -->|"2xx, 404 or 410"| OK["ref confirmed gone"]
    HTTP -->|"anything else"| SKIP["skip THIS doc only<br/>Sentry, retry next run"]
    OK -->|"only if EVERY ref confirmed"| HARD["hardDeleteVariable()<br/>re-check window, delete versions,<br/>permissions and doc"]
    HARD --> KEEP["auditLogs are KEPT"]
    HARD -->|"full batch and depth+1 under 20"| AGAIN["scheduler.runAfter(0, depth+1)"]
    AGAIN -.-> CRON`,
} as const;
