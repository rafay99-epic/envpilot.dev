/**
 * Centralized query key factory for TanStack Query.
 *
 * All query keys are defined here so cache invalidation is predictable
 * and there's a single source of truth for key shapes.
 *
 * Convention: each resource has an `all` key (for broad invalidation)
 * and specific sub-keys for individual queries.
 */
export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => ["auth", "me"] as const,
  },

  users: {
    all: ["users"] as const,
    me: () => ["users", "me"] as const,
    preferences: () => ["users", "preferences"] as const,
    sessions: () => ["users", "sessions"] as const,
    search: (query: string) => ["users", "search", query] as const,
  },

  organizations: {
    all: ["organizations"] as const,
    list: () => ["organizations", "list"] as const,
    detail: (slug: string) => ["organizations", "detail", slug] as const,
    members: (slug: string) => ["organizations", slug, "members"] as const,
    invitations: (slug: string) =>
      ["organizations", slug, "invitations"] as const,
  },

  projects: {
    all: ["projects"] as const,
    list: (orgId: string) => ["projects", "list", orgId] as const,
    detail: (id: string) => ["projects", "detail", id] as const,
    members: (id: string) => ["projects", id, "members"] as const,
  },

  variables: {
    all: ["variables"] as const,
    list: (projectId: string) => ["variables", "list", projectId] as const,
    detail: (id: string) => ["variables", "detail", id] as const,
    history: (id: string) => ["variables", id, "history"] as const,
  },

  tags: {
    all: ["tags"] as const,
    list: (orgId: string) => ["tags", "list", orgId] as const,
  },

  billing: {
    all: ["billing"] as const,
    subscription: (orgId: string) =>
      ["billing", "subscription", orgId] as const,
  },

  vault: {
    all: ["vault"] as const,
    status: () => ["vault", "status"] as const,
  },

  templates: {
    all: ["templates"] as const,
    list: () => ["templates", "list"] as const,
  },

  config: () => ["config"] as const,
  version: () => ["version"] as const,
} as const;
