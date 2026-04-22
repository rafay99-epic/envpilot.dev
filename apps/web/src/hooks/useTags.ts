"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createLogger } from "@/lib/logger";

const log = createLogger("hooks/useTags");

// ── Shared Tag type ──────────────────────────────────────────
// Used by tag-selector, tag-filter, variable-form, etc.
export interface Tag {
  _id: string;
  organizationId: string;
  name: string;
  color: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ── Queries ──────────────────────────────────────────────────

/**
 * List all tags for an organization (real-time via Convex WebSocket).
 */
export function useOrganizationTags(
  organizationId: Id<"organizations"> | string | undefined
) {
  const tags = useQuery(
    api.tags.listByOrganization,
    organizationId
      ? { organizationId: organizationId as Id<"organizations"> }
      : "skip"
  );

  return {
    tags: (tags ?? []) as Tag[],
    isLoading: organizationId ? tags === undefined : false,
  };
}

// ── Mutations ────────────────────────────────────────────────

/**
 * Create a tag directly via Convex (no API route needed).
 */
export function useCreateTag() {
  const mutate = useMutation(api.tags.create);
  const [isPending, setIsPending] = useState(false);

  return {
    isPending,
    mutateAsync: async (data: {
      organizationId: string;
      name: string;
      color: string;
      createdBy: string;
    }) => {
      setIsPending(true);
      try {
        const tagId = await mutate({
          organizationId: data.organizationId as Id<"organizations">,
          name: data.name,
          color: data.color,
          createdBy: data.createdBy as Id<"users">,
        });
        return { tag: { _id: tagId } };
      } catch (error) {
        log.error(
          "create_tag_failed",
          { organizationId: data.organizationId, name: data.name },
          error
        );
        throw error;
      } finally {
        setIsPending(false);
      }
    },
  };
}

/**
 * Update a tag directly via Convex.
 */
export function useUpdateTag() {
  const mutate = useMutation(api.tags.update);
  const [isPending, setIsPending] = useState(false);

  return {
    isPending,
    mutateAsync: async (data: {
      tagId: string;
      name?: string;
      color?: string;
      updatedBy: string;
    }) => {
      setIsPending(true);
      try {
        const tagId = await mutate({
          tagId: data.tagId as Id<"variableTags">,
          name: data.name,
          color: data.color,
          updatedBy: data.updatedBy as Id<"users">,
        });
        return { tag: { _id: tagId } };
      } catch (error) {
        log.error(
          "update_tag_failed",
          { tagId: data.tagId, name: data.name, color: data.color },
          error
        );
        throw error;
      } finally {
        setIsPending(false);
      }
    },
  };
}

/**
 * Delete a tag directly via Convex.
 */
export function useDeleteTag() {
  const mutate = useMutation(api.tags.remove);
  const [isPending, setIsPending] = useState(false);

  return {
    isPending,
    mutateAsync: async (data: { tagId: string; deletedBy: string }) => {
      setIsPending(true);
      try {
        const result = await mutate({
          tagId: data.tagId as Id<"variableTags">,
          deletedBy: data.deletedBy as Id<"users">,
        });
        return result;
      } catch (error) {
        log.error("delete_tag_failed", { tagId: data.tagId }, error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
  };
}
