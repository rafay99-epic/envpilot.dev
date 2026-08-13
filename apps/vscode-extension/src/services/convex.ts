import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";

/**
 * Async fetcher returning a fresh WorkOS access token (or null when signed
 * out). Matches Convex's AuthTokenFetcher: the server passes
 * `{ forceRefreshToken: true }` when it rejected the previous token, and the
 * fetcher must then refresh instead of returning the same cached token.
 */
export type TokenFetcher = (args?: {
  forceRefreshToken: boolean;
}) => Promise<string | null>;

type SubscriptionErrorHandler = (error: Error) => void;

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
  private nextSubscriptionId = 0;
  private _disposed = false;
  private fetcher: TokenFetcher;
  /** Last auth state reported by the client's setAuth onChange callback. */
  private _authenticated = true;
  private reauthTimer: ReturnType<typeof setTimeout> | null = null;
  private reauthAttempt = 0;
  /** Capped backoff for re-auth after a transient refresh failure — a null
   * token is TERMINAL for the Convex client, so we must call setAuth again. */
  private static readonly REAUTH_DELAYS_MS = [5_000, 15_000, 60_000];
  private static readonly REAUTH_CAP_MS = 3 * 60 * 1000;

  constructor(convexUrl: string, getFreshToken: TokenFetcher) {
    this.client = new ConvexClient(convexUrl);
    this.fetcher = getFreshToken;
    // Authenticate the socket with a WorkOS JWT, refreshed on demand. Convex
    // calls this fetcher whenever it needs a (fresh) token.
    this.applyAuth();
  }

  private applyAuth(): void {
    this.client.setAuth(this.fetcher, (isAuthenticated) => {
      this._authenticated = isAuthenticated;
      if (isAuthenticated) {
        this.reauthAttempt = 0;
        this.clearReauthTimer();
      } else if (!this._disposed) {
        // The fetcher returned null (transient refresh failure or signed
        // out). Retrying while signed out is a cheap local storage read —
        // no network — so no account check is needed here.
        this.scheduleReauth();
      }
    });
  }

  /** Whether the socket's auth is currently alive (per the last onChange). */
  get isAuthenticated(): boolean {
    return this._authenticated;
  }

  /**
   * Force the socket to re-run token fetch + authentication. Used after an
   * account switch (the old socket auth belongs to the previous account) and
   * by the transient-failure backoff.
   */
  reauthenticate(): void {
    this.clearReauthTimer();
    this.reauthAttempt = 0;
    this.applyAuth();
  }

  private scheduleReauth(): void {
    if (this.reauthTimer) return;
    const delay =
      ConvexService.REAUTH_DELAYS_MS[this.reauthAttempt] ??
      ConvexService.REAUTH_CAP_MS;
    this.reauthAttempt++;
    this.reauthTimer = setTimeout(() => {
      this.reauthTimer = null;
      if (!this._disposed) this.applyAuth();
    }, delay);
    this.reauthTimer.unref?.();
  }

  private clearReauthTimer(): void {
    if (this.reauthTimer) {
      clearTimeout(this.reauthTimer);
      this.reauthTimer = null;
    }
  }

  /**
   * Subscribe to the signed-in user's unacknowledged revocation events.
   * Identity-scoped — no access tokens are passed. Callback fires with the
   * events array whenever new revocations appear.
   */
  subscribeToRevocations(
    callback: (events: RevocationEvent[]) => void,
    onError: SubscriptionErrorHandler
  ): string {
    const id = `revocations-${this.nextSubscriptionId++}`;

    const unsubscribe = this.client.onUpdate(
      anyApi.features.permissions.revocationEvents.listMine,
      {},
      (events: unknown) => {
        const arr = (events as RevocationEvent[]) ?? [];
        if (arr.length > 0) {
          callback(arr);
        }
      },
      onError
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
    callback: (records: CallerProjectAccess[]) => void,
    onError: SubscriptionErrorHandler
  ): string {
    const id = `access-${this.nextSubscriptionId++}`;

    const unsubscribe = this.client.onUpdate(
      anyApi.features.users.projectAccess.listForCaller,
      {},
      (records: unknown) => {
        callback((records as CallerProjectAccess[]) ?? []);
      },
      onError
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
    ) => void,
    onError: SubscriptionErrorHandler
  ): string {
    const id = `vars-${projectId.slice(0, 8)}-${this.nextSubscriptionId++}`;

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
      },
      onError
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
    this.clearReauthTimer();
    this.unsubscribeAll();
    await this.client.close();
  }
}
