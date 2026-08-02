import { v } from "convex/values";
import { internalAction } from "../../_generated/server";

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
 * ctx.runAction(internal.features.vault.vault.*). Never expose them publicly.
 *
 * ZERO-DATA-LOSS CONTRACT: the `vaultRef` is the opaque WorkOS object id string.
 * Existing refs created by the old lib/vault.ts path MUST keep resolving — the
 * REST shapes here mirror the SDK exactly (key_context camelCase; version_id /
 * key_id in responses). Do not change the create-name scheme for parity.
 */

const VAULT_BASE = "https://api.workos.com/vault/v1/kv";
const VAULT_TIMEOUT_MS = 10_000;
const VAULT_RECONCILE_TIMEOUT_MS = 3_000;

type VaultObjectResult = {
  id: string;
  versionId?: string;
  keyId?: string;
};

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

function safeHeader(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(trimmed) ? trimmed : undefined;
}

async function providerFailure(
  operation: string,
  response: Response
): Promise<Error> {
  const requestId = safeHeader(
    response.headers.get("x-request-id") ??
      response.headers.get("workos-request-id")
  );
  let code: string | undefined;
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    code = typeof body.code === "string" ? safeHeader(body.code) : undefined;
  } catch {
    // Provider bodies and messages may contain sensitive data. Ignore them.
  }
  const diagnostics = [
    `status=${response.status}`,
    code ? `code=${code}` : undefined,
    requestId ? `request_id=${requestId}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  return new Error(`Vault ${operation} failed (${diagnostics})`);
}

function parseObjectResult(data: {
  id?: unknown;
  version_id?: unknown;
  key_id?: unknown;
  metadata?: { version_id?: unknown; key_id?: unknown };
}): VaultObjectResult {
  if (typeof data.id !== "string" || data.id.length === 0) {
    throw new Error("Vault response failed validation (code=invalid_response)");
  }
  const versionId = data.metadata?.version_id ?? data.version_id;
  const keyId = data.metadata?.key_id ?? data.key_id;
  return {
    id: data.id,
    versionId: typeof versionId === "string" ? versionId : undefined,
    keyId: typeof keyId === "string" ? keyId : undefined,
  };
}

async function readCreatedObjectByName(
  uniqueName: string
): Promise<VaultObjectResult | null> {
  let response: Response;
  try {
    response = await fetch(
      `${VAULT_BASE}/name/${encodeURIComponent(uniqueName)}`,
      {
        method: "GET",
        headers: authHeaders(false),
        signal: AbortSignal.timeout(VAULT_RECONCILE_TIMEOUT_MS),
      }
    );
  } catch {
    return null;
  }
  if (response.status === 404) return null;
  if (!response.ok)
    throw await providerFailure("create reconciliation", response);
  return parseObjectResult(
    (await response.json()) as Parameters<typeof parseObjectResult>[0]
  );
}

async function readUpdatedObject(
  vaultRef: string,
  expectedValue: string
): Promise<VaultObjectResult | null> {
  let response: Response;
  try {
    response = await fetch(`${VAULT_BASE}/${encodeURIComponent(vaultRef)}`, {
      method: "GET",
      headers: authHeaders(false),
      signal: AbortSignal.timeout(VAULT_RECONCILE_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw await providerFailure("update reconciliation", response);
  }
  const data = (await response.json()) as Parameters<
    typeof parseObjectResult
  >[0] & { value?: unknown };
  if (data.value !== expectedValue) return null;
  return parseObjectResult(data);
}

async function reconcileUpdatedObject(
  vaultRef: string,
  expectedValue: string
): Promise<VaultObjectResult | null> {
  for (const delay of [0, 250, 1_000]) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const reconciled = await readUpdatedObject(vaultRef, expectedValue);
    if (reconciled) return reconciled;
  }
  return null;
}

/** Create an encrypted object. Returns the opaque vaultRef id. */
export const createSecret = internalAction({
  args: {
    name: v.string(),
    value: v.string(),
    organizationId: v.string(),
    projectId: v.string(),
    environment: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  returns: v.object({
    id: v.string(),
    versionId: v.optional(v.string()),
    keyId: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    // Unique object name mirrors lib/vault.ts exactly so behavior is identical.
    if (
      args.idempotencyKey !== undefined &&
      !/^[A-Za-z0-9_-]{1,128}$/.test(args.idempotencyKey)
    ) {
      throw new Error("Vault create idempotency key is invalid");
    }
    const uniqueName = `${args.name}:${args.projectId}:${args.idempotencyKey ?? Date.now()}`;
    const key_context: Record<string, string> = {
      organizationId: args.organizationId,
      projectId: args.projectId,
    };
    if (args.environment) key_context.environment = args.environment;

    let res: Response;
    try {
      // Do not client-abort this state-changing request: an abort cannot prove
      // whether WorkOS committed the object. If the connection itself fails,
      // reconcile by the deterministic object name before reporting failure.
      res = await fetch(VAULT_BASE, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          name: uniqueName,
          value: args.value,
          key_context,
        }),
      });
    } catch {
      for (const delay of [0, 250, 1_000]) {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        const reconciled = await readCreatedObjectByName(uniqueName);
        if (reconciled) return reconciled;
      }
      throw new Error(
        "Vault create outcome could not be confirmed (code=network_error)"
      );
    }
    if (!res.ok) {
      throw await providerFailure("create", res);
    }
    try {
      return parseObjectResult(
        (await res.json()) as Parameters<typeof parseObjectResult>[0]
      );
    } catch {
      const reconciled = await readCreatedObjectByName(uniqueName);
      if (reconciled) return reconciled;
      throw new Error("Vault create failed (code=invalid_response)");
    }
  },
});

/** Read + decrypt an object by ref. Throws NOT_FOUND-style on empty value. */
export const readSecret = internalAction({
  args: { vaultRef: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => {
    let res: Response;
    try {
      res = await fetch(`${VAULT_BASE}/${encodeURIComponent(args.vaultRef)}`, {
        method: "GET",
        headers: authHeaders(false),
        signal: AbortSignal.timeout(VAULT_TIMEOUT_MS),
      });
    } catch {
      throw new Error("Vault read failed (code=network_error)");
    }
    if (!res.ok) {
      throw await providerFailure("read", res);
    }
    let data: { value?: string | null };
    try {
      data = (await res.json()) as { value?: string | null };
    } catch {
      throw new Error("Vault read failed (code=invalid_response)");
    }
    // Distinguish a genuinely-missing value (undefined/null) from a valid
    // empty-string secret — `!data.value` would wrongly reject "".
    if (data.value === undefined || data.value === null) {
      throw new Error("Vault read failed (code=missing_value)");
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

    let res: Response;
    try {
      // Like create, an update must not be client-aborted: reporting failure
      // after WorkOS committed would leave Convex metadata behind the value.
      res = await fetch(`${VAULT_BASE}/${encodeURIComponent(args.vaultRef)}`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify(body),
      });
    } catch {
      const reconciled = await reconcileUpdatedObject(
        args.vaultRef,
        args.value
      );
      if (reconciled) return reconciled;
      throw new Error(
        "Vault update outcome could not be confirmed (code=network_error)"
      );
    }
    if (!res.ok) {
      throw await providerFailure("update", res);
    }
    try {
      return parseObjectResult(
        (await res.json()) as Parameters<typeof parseObjectResult>[0]
      );
    } catch {
      const reconciled = await reconcileUpdatedObject(
        args.vaultRef,
        args.value
      );
      if (reconciled) return reconciled;
      throw new Error("Vault update failed (code=invalid_response)");
    }
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
    try {
      const res = await fetch(
        `${VAULT_BASE}/${encodeURIComponent(args.vaultRef)}`,
        {
          method: "DELETE",
          headers: authHeaders(false),
          signal: AbortSignal.timeout(VAULT_TIMEOUT_MS),
        }
      );
      if (res.ok || res.status === 404 || res.status === 410) return true;
      console.warn((await providerFailure("delete", res)).message);
      return false;
    } catch {
      console.warn("Vault delete failed (code=network_error)");
      return false;
    }
  },
});
