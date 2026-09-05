"use client";

import { toast } from "sonner";
import type { FunctionArgs } from "convex/server";
import { api } from "@convex/_generated/api";
import { sanitizeConvexError } from "@/lib/error-messages";

export type ProposalArgs = FunctionArgs<
  typeof api.features.changeRequests.mutations.create
>;

/**
 * Files a delete/restore proposal for a write protection just refused, and
 * reports the outcome. Shared by the account, file and trash surfaces, which
 * all offer it from the blocked write's toast.
 */
export async function fileProposal(
  create: (args: ProposalArgs) => Promise<unknown>,
  args: ProposalArgs
): Promise<void> {
  try {
    await create(args);
    toast.success("Sent for approval.");
  } catch (err) {
    toast.error(sanitizeConvexError(err));
  }
}
