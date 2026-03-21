# TanStack Query Integration Guide

This guide explains how TanStack Query is used alongside Convex in the Envpilot web app, and how to add new endpoints.

## Architecture Overview

The web app has **two data-fetching layers**:

| Layer                  | Library                                                                | Use For                                                  | Cache Strategy                                     |
| ---------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| **Real-time database** | Convex (`useQuery`/`useMutation` from `convex/react`)                  | Direct database subscriptions that need live updates     | WebSocket-based, automatic                         |
| **REST API calls**     | TanStack Query (`useQuery`/`useMutation` from `@tanstack/react-query`) | All `/api/*` endpoint calls (CRUD, billing, auth, vault) | Time-based (`staleTime: 30s`), manual invalidation |

**Rule of thumb:** If the data lives in Convex and needs real-time updates, use the Convex hooks in `src/hooks/use*.ts`. If you're calling a REST API endpoint, use TanStack Query hooks in `src/hooks/queries/`.

### Why Both?

Convex provides real-time subscriptions via WebSocket — data updates automatically when the database changes. This is perfect for dashboards, live counters, and collaborative features. TanStack Query handles the REST API layer — calls to `/api/*` routes that go through Next.js, touch external services (WorkOS Vault, Polar.sh, Resend), or perform complex server-side operations. These don't need real-time subscriptions but benefit from caching, deduplication, retry logic, and structured loading/error states.

## Key Files

```
src/lib/query-keys.ts          # Centralized query key factory
src/lib/api-client.ts          # Typed fetch wrapper (api.get, api.post, etc.)
src/hooks/queries/             # All TanStack Query hooks
  index.ts                     # Barrel export
  useAuthQuery.ts              # /api/auth/me
  useUsersQuery.ts             # /api/users/me, preferences, sessions
  useOrganizationsQuery.ts     # /api/organizations CRUD
  useProjectsQuery.ts          # /api/projects CRUD
  useVariablesQuery.ts         # /api/variables CRUD + history + rollback
  useVariableRequestsQuery.ts  # /api/variable-requests
  useBillingQuery.ts           # /api/billing/*
src/components/ConvexClientProvider.tsx  # QueryClientProvider setup
```

## How to Add a New Query

### Step 1: Add Query Key

In `src/lib/query-keys.ts`:

```ts
export const queryKeys = {
  // ... existing keys
  myResource: {
    all: ["my-resource"] as const,
    list: (parentId: string) => ["my-resource", "list", parentId] as const,
    detail: (id: string) => ["my-resource", "detail", id] as const,
  },
};
```

### Step 2: Create Query Hook

In `src/hooks/queries/useMyResourceQuery.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

// Define response types
interface MyResource {
  _id: string;
  name: string;
  // ...
}

// Query hook
export function useMyResourceList(parentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.myResource.list(parentId!),
    queryFn: () =>
      api.get<{ items: MyResource[] }>(`/api/my-resource?parentId=${parentId}`),
    enabled: !!parentId, // Don't fetch until parentId is available
  });
}

// Mutation hook
export function useCreateMyResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; parentId: string }) =>
      api.post<{ item: MyResource }>("/api/my-resource", data),
    onSuccess: (_, variables) => {
      // Invalidate the list so it refetches
      queryClient.invalidateQueries({
        queryKey: queryKeys.myResource.list(variables.parentId),
      });
    },
  });
}
```

### Step 3: Export from Barrel

In `src/hooks/queries/index.ts`:

```ts
export { useMyResourceList, useCreateMyResource } from "./useMyResourceQuery";
```

### Step 4: Use in Component

```tsx
import { useMyResourceList, useCreateMyResource } from "@/hooks/queries";

function MyComponent({ parentId }: { parentId: string }) {
  const { data, isLoading, error } = useMyResourceList(parentId);
  const createResource = useCreateMyResource();

  const handleCreate = async () => {
    try {
      await createResource.mutateAsync({ name: "New Item", parentId });
      // Cache is automatically invalidated, list will refetch
    } catch (err) {
      // Handle error
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <ul>
      {data?.items.map((item) => (
        <li key={item._id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

## Query Key Conventions

- Use the factory pattern from `queryKeys` — never hardcode key arrays
- Structure: `[resource, scope, identifier]`
- Use `.all` keys for broad invalidation (e.g., invalidate everything about organizations)
- Use specific keys for targeted invalidation

```ts
// Invalidate a specific project's variable list
queryClient.invalidateQueries({
  queryKey: queryKeys.variables.list(projectId),
});

// Invalidate ALL variable queries (lists + details + history)
queryClient.invalidateQueries({ queryKey: queryKeys.variables.all });
```

## Cache Invalidation Patterns

### After a Mutation

Always invalidate related queries in the mutation's `onSuccess`:

```ts
useMutation({
  mutationFn: (data) => api.post("/api/variables", data),
  onSuccess: (_, variables) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.variables.list(variables.projectId),
    });
  },
});
```

### Cross-Resource Invalidation

Some mutations affect multiple resources:

```ts
// Creating an organization also affects the auth state (organization list)
useMutation({
  mutationFn: (data) => api.post("/api/organizations", data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.organizations.list() });
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() }); // Updates org list in auth
  },
});
```

### Convex + TanStack Query Coordination

When a REST mutation writes to Convex, the Convex subscription hooks update automatically via WebSocket. You only need to invalidate TanStack Query caches — never manually update Convex subscription data.

## API Client Usage

The `api` client in `src/lib/api-client.ts` provides typed methods:

```ts
import { api, ApiError } from "@/lib/api-client";

// GET request
const data = await api.get<{ projects: Project[] }>("/api/projects?orgId=123");

// POST request
const result = await api.post<{ project: Project }>("/api/projects", {
  name: "My Project",
  slug: "my-project",
});

// Error handling
try {
  await api.post("/api/variables", data);
} catch (err) {
  if (err instanceof ApiError) {
    console.log(err.status); // HTTP status code
    console.log(err.code); // Application error code (e.g., "TIER_LIMIT_REACHED")
    console.log(err.message); // Error message
  }
}
```

## Default Configuration

Set in `ConvexClientProvider.tsx`:

| Option                 | Value      | Reason                                     |
| ---------------------- | ---------- | ------------------------------------------ |
| `staleTime`            | 30 seconds | REST data doesn't need real-time freshness |
| `gcTime`               | 5 minutes  | Keep unused data in cache briefly          |
| `retry`                | 1          | One retry for transient network failures   |
| `refetchOnWindowFocus` | true       | Refresh stale data when user returns       |

Override per-query when needed:

```ts
useQuery({
  queryKey: queryKeys.version(),
  queryFn: () => api.get("/api/version"),
  staleTime: 10 * 60 * 1000, // 10 minutes — version rarely changes
});
```

## Migration Checklist

When converting a component from raw `fetch` to TanStack Query:

1. Identify all `fetch()` calls in the component
2. For each fetch, find or create the corresponding query/mutation hook
3. Replace `useState` + `useEffect` + `useCallback` fetch patterns with query hooks
4. Replace manual `fetch` + error handling in handlers with mutation hooks
5. Remove state variables that TanStack Query now manages (`isLoading`, `error`, data arrays)
6. Keep UI-only state (`showModal`, `selectedItem`, etc.) as local `useState`
7. Verify the component still works — check loading, error, and success states

## What NOT to Migrate

- **Convex hooks** in `src/hooks/use*.ts` — these use `convex/react` and provide real-time subscriptions
- **Zustand stores** — these are client-side state, not data fetching
- **useVault hook** — imperative vault operations (create/read/update/delete secrets)
- **File downloads** (export) — these return blobs, not JSON, and don't benefit from caching

## DevTools

TanStack Query DevTools are included in development mode. Look for the floating icon in the bottom-left corner of the page. Use it to:

- Inspect the query cache
- See which queries are loading, stale, or fresh
- Manually invalidate or refetch queries
- Debug cache key structures
