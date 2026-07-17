import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";

/** Async fetcher returning a fresh WorkOS access token (or null when signed out). */
export type TokenFetcher = () => Promise<string | null>;

/** A single active project-access scoping record for the caller. */
export interface CallerProjectAccess {
  _id: string;
  projectId: string;
  deviceId?: string;
  deviceName?: string;
  expiresAt: number;
}

/** A permission-revocation event delivered to the signed-in user. */
export interface RevocationEvent {
  accessToken: string;
  eventId: string;
  projectId: string;
  userId: string;
  reason: string;
  revokedAt: number;
}

/**
 * ConvexService manages a persistent, authenticated WebSocket connection to
 * Convex.
 *
 * Auth: the socket is authenticated with a WorkOS AuthKit JWT via
 * `client.setAuth(getFreshToken)`. Every subscription/mutation is therefore
 * identity-scoped server-side — no per-project access token strings are passed
 * as args anymore.
 *
 * Reactive subscriptions (replace the old HTTP polling):
 * - Revocation events (`permissionRevocationEvents.listMine`): fires instantly
 *   when any of the caller's project accesses is revoked.
 * - Project access (`projectAccess.listForCaller`): the caller's live set of
 *   linked projects — a project dropping out means access ended.
 * - Variable metadata (`variables.listMetadataByProject`): fires when variables
 *   change (triggers an HTTP fetch for decrypted values).
 */
export class ConvexService {
  private client: ConvexClient;
  private subscriptions = new Map<string, () => void>();
  private _disposed = false;

  constructor(convexUrl: string, getFreshToken: TokenFetcher) {
    this.client = new ConvexClient(convexUrl);
    // Authenticate the socket with a WorkOS JWT, refreshed on demand. Convex
    // calls this fetcher whenever it needs a (fresh) token.
    this.client.setAuth(getFreshToken);
  }

  /**
   * Subscribe to the signed-in user's unacknowledged revocation events.
   * Identity-scoped — no access tokens are passed. Callback fires with the
   * events array whenever new revocations appear.
   */
  subscribeToRevocations(
    callback: (events: RevocationEvent[]) => void
  ): string {
    const id = `revocations-${Date.now()}`;

    const unsubscribe = this.client.onUpdate(
      anyApi.features.permissions.revocationEvents.listMine,
      {},
      (events: unknown) => {
        const arr = (events as RevocationEvent[]) ?? [];
        if (arr.length > 0) {
          callback(arr);
        }
      }
    );

    this.subscriptions.set(id, unsubscribe);
    return id;
  }

  /**
   * Subscribe to the caller's active project-access scoping records. Fires with
   * the current set whenever it changes — a previously linked project vanishing
   * from this set means its access has ended (expired/revoked). Replaces the
   * old per-access-token validation subscription.
   */
  subscribeToProjectAccess(
    callback: (records: CallerProjectAccess[]) => void
  ): string {
    const id = `access-${Date.now()}`;

    const unsubscribe = this.client.onUpdate(
      anyApi.features.users.projectAccess.listForCaller,
      {},
      (records: unknown) => {
        callback((records as CallerProjectAccess[]) ?? []);
      }
    );

    this.subscriptions.set(id, unsubscribe);
    return id;
  }

  /**
   * Subscribe to variable metadata changes for a project.
   * Returns metadata WITHOUT decrypted values — use HTTP for vault decryption.
   * Callback fires whenever variables are added, removed, or updated.
   */
  subscribeToVariableMetadata(
    projectId: string,
    environment: string | undefined,
    callback: (
      metadata: Array<{
        _id: string;
        key: string;
        environments: string[];
        isSensitive: boolean;
        version: number;
        updatedAt: number;
      }>
    ) => void
  ): string {
    const id = `vars-${projectId.slice(0, 8)}-${Date.now()}`;

    const unsubscribe = this.client.onUpdate(
      anyApi.features.variables.queries.listMetadataByProject,
      { projectId, environment },
      (metadata: unknown) => {
        callback(
          (metadata as Array<{
            _id: string;
            key: string;
            environments: string[];
            isSensitive: boolean;
            version: number;
            updatedAt: number;
          }>) ?? []
        );
      }
    );

    this.subscriptions.set(id, unsubscribe);
    return id;
  }

  /**
   * Acknowledge revocation events via mutation. Identity-scoped — the backend
   * only acknowledges events that belong to the signed-in user.
   */
  async acknowledgeRevocations(eventIds: string[]): Promise<void> {
    await this.client.mutation(
      anyApi.features.permissions.revocationEvents.acknowledgeMine,
      { eventIds }
    );
  }

  /**
   * Unsubscribe from a specific subscription.
   */
  unsubscribe(id: string): void {
    const unsub = this.subscriptions.get(id);
    if (unsub) {
      unsub();
      this.subscriptions.delete(id);
    }
  }

  /**
   * Unsubscribe from all active subscriptions.
   */
  unsubscribeAll(): void {
    for (const unsub of this.subscriptions.values()) {
      unsub();
    }
    this.subscriptions.clear();
  }

  /**
   * Clean up the WebSocket connection.
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    this.unsubscribeAll();
    await this.client.close();
  }
}
