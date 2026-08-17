"use client";

import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Reveal one decrypted secret by its opaque vaultRef.
 *
 * Authorization is by RESOURCE, not by a client-supplied organization id: the
 * action reverse-looks-up the row that owns the ref and runs the same
 * per-resource access check the rest of the app uses. An unknown ref fails
 * closed. The old `/api/vault` route passed the same JWT to the same action.
 */
export function useRevealSecret() {
  const reveal = useAction(api.features.vault.reveal.reveal);
  return async (vaultRef: string): Promise<string> => {
    const { value } = await reveal({ vaultRef });
    return value;
  };
}
