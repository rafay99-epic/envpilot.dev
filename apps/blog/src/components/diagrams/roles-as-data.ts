export const diagrams = {
  "roles-as-data-three-eras": `flowchart LR
    subgraph E0["ERA 0: before PR 51"]
      direction TB
      A0["Browser<br/>ROLES.MEMBER.permissions"] -->|"decides"| B0["API route<br/>inline role check"]
      B0 --> C0["Convex mutation<br/>no check"]
    end
    subgraph E1["ERA 1: PR 51 to PR 70"]
      direction TB
      A1["Browser<br/>canDo(org:x), render hint only"] -->|"asks"| B1["convex/authz.ts<br/>ORG_ACTIONS + assertOrgAction()"]
      B1 --> C1["Convex mutation"]
    end
    subgraph E2["ERA 2: PR 128 and PR 130"]
      direction TB
      A2["Browser / CLI / extension<br/>capabilities, render hint only"] -->|"asks"| B2["convex/lib/authz.ts<br/>getRoleProfile(ctx, slug)"]
      B2 --> R2["roleRegistry row (DB)"]
      B2 --> S2["SYSTEM_PROFILES (code)"]
      B2 --> U2["UNKNOWN_ROLE_PROFILE"]
      R2 --> H2["hasCapability(profile, org.manage)"]
      S2 --> H2
      U2 --> H2
    end`,
  "roles-as-data-assert-project-action": `flowchart TD
    A["assertProjectAction(ctx, userId, projectId, project:update_variable)"] --> B["1. project doc<br/>2. organizationMembers role<br/>3. not suspended"]
    B --> C["normalizeOrgRole(editor), then getRoleProfile()<br/>one resolution per request<br/>Convex DB-IO cost rule"]
    C -->|"roleRegistry by_slug, isActive"| D["profile from DATA"]
    C -->|"row exists but inactive"| E["UNKNOWN_ROLE_PROFILE<br/>fails closed"]
    C -->|"no row (pre-seed)"| F["SEEDED_CUSTOM_PROFILES.editor"]
    D --> G["PROJECT_ACTION_TO_CAPABILITY[action]<br/>= project.variables.update"]
    F --> G
    G --> H{"bypassesAssignment(profile)?"}
    H -->|"yes"| K["capability check only"]
    H -->|"no"| I{"projectMembers by_project_and_user"}
    I -->|"none"| J["ConvexError: No access to this project"]
    I -->|"found"| K
    K --> L{"hasCapability(profile, project.variables.update)"}
    L -->|"false"| M["ConvexError"]
    L -->|"true"| N["environmentScope = hasCapability(access.env_scoped)<br/>? projectMembership.environments : undefined"]`,
  "roles-as-data-merge-seed": `flowchart LR
    S["SEED_ROLES (code)"] -->|"full overwrite"| OW["owner row<br/>never editable"]
    S -->|"project_manager, team_lead, developer"| MG["mergeSystemRoleCapabilities(defaults, stored)"]
    S -->|"editor, viewer"| IN["insert-only, skipped if present<br/>panel owns them after seed"]
    MG --> R1["stored has key: stored value WINS"]
    MG --> R2["stored lacks key: code default fills in"]
    MG --> R3["not in catalog: dropped"]
    OW --> LIVE[("roleRegistry rows<br/>live, admin-edited")]
    R1 --> LIVE
    R2 --> LIVE
    R3 --> LIVE
    IN --> LIVE
    LIVE --> RET["returns created, updated, skipped,<br/>and per-role drift"]`,
} as const;
