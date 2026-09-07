import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type DeletedVariable = FunctionReturnType<
  typeof api.features.variables.queries.getDeleted
>[number];
export type DeletedAccount = FunctionReturnType<
  typeof api.features.accounts.queries.getDeleted
>[number];
export type DeletedFile = FunctionReturnType<
  typeof api.features.files.queries.getDeleted
>[number];
export type DeletedDoc = FunctionReturnType<
  typeof api.features.docs.queries.listTrashed
>[number];

/** The four trash lists; each stays `undefined` until its query resolves. */
export interface TrashLists {
  variables: DeletedVariable[] | undefined;
  accounts: DeletedAccount[] | undefined;
  files: DeletedFile[] | undefined;
  docs: DeletedDoc[] | undefined;
}

export interface TrashSectionProps {
  projectId: Id<"projects"> | undefined;
  now: number;
  restoringId: string | null;
  onRestoringChange: (id: string | null) => void;
  emptying: boolean;
}

export function trashIsLoading(lists: TrashLists): boolean {
  return (
    lists.variables === undefined ||
    lists.accounts === undefined ||
    lists.files === undefined ||
    lists.docs === undefined
  );
}

export function trashItemCount(lists: TrashLists): number {
  return (
    (lists.variables?.length ?? 0) +
    (lists.accounts?.length ?? 0) +
    (lists.files?.length ?? 0) +
    (lists.docs?.length ?? 0)
  );
}
