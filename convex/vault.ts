import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/**
 * WorkOS Vault primitive — Stage 3.
 *
 * The single home for secret-value crypto. Replaces apps/web/src/lib/vault.ts:
 * plaintext values now travel to Convex (the backend), which encrypts them into
 * WorkOS Vault and hands back only an opaque `vaultRef` id. Convex stores the
 * ref, never the plaintext.
 *
 * Raw REST (no @workos-inc/node dependency in convex/) — byte-compatible with
 * the SDK's serializers, and the same pattern convex/vaultGc.ts already uses.
 * WORKOS_API_KEY is set in the Convex deployment env.
 *
 * These are INTERNAL actions on purpose: reading a secret by ref has no
 * authorization of its own, so only trusted composed functions (which run
 * requireAuthedUser + per-variable access checks first) may call them via
 * ctx.runAction(internal.vault.*). Never expose them publicly.
 *
 * ZERO-DATA-LOSS CONTRACT: the `vaultRef` is the opaque WorkOS object id string.
 * Existing refs created by the old lib/vault.ts path MUST keep resolving — the
 * REST shapes here mirror the SDK exactly (key_context camelCase; version_id /
 * key_id in responses). Do not change the create-name scheme for parity.
 */

const VAULT_BASE = "https://api.workos.com/vault/v1/kv";

function apiKey(): string {
  const key = process.env.WORKOS_API_KEY;
  if (!key) {
    // Never proceed without the key — a vault op that silently no-ops would be
    // a data-integrity hazard (e.g. storing a bogus ref, or "reading" nothing).
    throw new Error("WORKOS_API_KEY is not set in the Convex deployment env");
  }
  return key;
}

function authHeaders(json: boolean): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${apiKey()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/** Create an encrypted object. Returns the opaque vaultRef id. */
export const createSecret = internalAction({
  args: {
    name: v.string(),
    value: v.string(),
    organizationId: v.string(),
    projectId: v.string(),
    environment: v.optional(v.string()),
  },
  returns: v.object({
    id: v.string(),
    versionId: v.optional(v.string()),
    keyId: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    // Unique object name mirrors lib/vault.ts exactly so behavior is identical.
    const uniqueName = `${args.name}:${args.projectId}:${Date.now()}`;
    const key_context: Record<string, string> = {
      organizationId: args.organizationId,
      projectId: args.projectId,
    };
    if (args.environment) key_context.environment = args.environment;

    const res = await fetch(VAULT_BASE, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        name: uniqueName,
        value: args.value,
        key_context,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Vault create failed (${res.status}): ${body}`);
    }
    const data = (await res.json()) as {
      id: string;
      version_id?: string;
      key_id?: string;
    };
    return { id: data.id, versionId: data.version_id, keyId: data.key_id };
  },
});

/** Read + decrypt an object by ref. Throws NOT_FOUND-style on empty value. */
export const readSecret = internalAction({
  args: { vaultRef: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const res = await fetch(
      `${VAULT_BASE}/${encodeURIComponent(args.vaultRef)}`,
      { method: "GET", headers: authHeaders(false) }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Vault read failed (${res.status}): ${body}`);
    }
    const data = (await res.json()) as { value?: string };
    if (!data.value) {
      throw new Error(`Secret "${args.vaultRef}" has no value`);
    }
    return data.value;
  },
});

/** Update the value; same id, new version. */
export const updateSecret = internalAction({
  args: {
    vaultRef: v.string(),
    value: v.string(),
    versionCheck: v.optional(v.string()),
  },
  returns: v.object({
    id: v.string(),
    versionId: v.optional(v.string()),
    keyId: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    const body: Record<string, string> = { value: args.value };
    if (args.versionCheck) body.version_check = args.versionCheck;

    const res = await fetch(
      `${VAULT_BASE}/${encodeURIComponent(args.vaultRef)}`,
      { method: "PUT", headers: authHeaders(true), body: JSON.stringify(body) }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Vault update failed (${res.status}): ${errBody}`);
    }
    const data = (await res.json()) as {
      id: string;
      metadata?: { version_id?: string; key_id?: string };
    };
    return {
      id: data.id,
      versionId: data.metadata?.version_id,
      keyId: data.metadata?.key_id,
    };
  },
});

/**
 * Delete (scheduled) an object. Returns true when gone or already gone
 * (2xx/404/410), false otherwise — callers MUST NOT hard-delete the owning
 * Convex row unless this returns true (matches convex/vaultGc.ts semantics so a
 * live secret is never orphaned).
 */
export const deleteSecret = internalAction({
  args: { vaultRef: v.string() },
  returns: v.boolean(),
  handler: async (_ctx, args) => {
    const res = await fetch(
      `${VAULT_BASE}/${encodeURIComponent(args.vaultRef)}`,
      { method: "DELETE", headers: authHeaders(false) }
    );
    return res.ok || res.status === 404 || res.status === 410;
  },
});
