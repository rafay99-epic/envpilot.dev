import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";

/**
 * ConvexService manages a persistent WebSocket connection to Convex.
 *
 * Replaces HTTP polling with reactive subscriptions:
 * - Revocation events: fires instantly when a token is revoked
 * - Token validation: fires when a token becomes invalid
 * - Variable metadata: fires when variables change (triggers HTTP fetch for decrypted values)
 *
 * Cost impact: ~744 HTTP calls/hr/user → 1 WebSocket connection
 */
export class ConvexService {
  private client: ConvexClient;
  private subscriptions = new Map<string, () => void>();
  private _disposed = false;

  constructor(convexUrl: string) {
    this.client = new ConvexClient(convexUrl);
  }

  /**
   * Subscribe to revocation events for the given access tokens.
   * Callback fires with events array whenever revocations are detected.
   */
  subscribeToRevocations(
    accessTokens: string[],
    callback: (
      events: Array<{
        accessToken: string;
        eventId: string;
        projectId: string;
        userId: string;
        reason: string;
        revokedAt: number;
      }>
    ) => void
  ): string {
    const id = `revocations-${Date.now()}`;

    const unsubscribe = this.client.onUpdate(
      anyApi.permissionRevocationEvents.checkForTokens,
      { accessTokens },
      (events: unknown) => {
        const arr = events as Array<{
          accessToken: string;
          eventId: string;
          projectId: string;
          userId: string;
          reason: string;
          revokedAt: number;
        }>;
        if (arr && arr.length > 0) {
          callback(arr);
        }
      }
    );

    this.subscriptions.set(id, unsubscribe);
    return id;
  }

  /**
   * Subscribe to token validation for a single access token.
   * Callback fires with the access info (null if token is invalid/expired).
   */
  subscribeToTokenValidation(
    accessToken: string,
    callback: (
      result: {
        projectId: string;
        userId: string;
        expiresAt: number;
      } | null
    ) => void
  ): string {
    const id = `token-${accessToken.slice(0, 8)}-${Date.now()}`;

    const unsubscribe = this.client.onUpdate(
      anyApi.projectAccess.getByAccessToken,
      { accessToken },
      (result: unknown) => {
        callback(
          result as {
            projectId: string;
            userId: string;
            expiresAt: number;
          } | null
        );
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
      anyApi.variables.listMetadataByProject,
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
   * Update an existing subscription with new args (e.g., when tokens change).
   * Unsubscribes the old one and creates a new subscription.
   */
  updateRevocationSubscription(
    oldId: string,
    accessTokens: string[],
    callback: (
      events: Array<{
        accessToken: string;
        eventId: string;
        projectId: string;
        userId: string;
        reason: string;
        revokedAt: number;
      }>
    ) => void
  ): string {
    this.unsubscribe(oldId);
    return this.subscribeToRevocations(accessTokens, callback);
  }

  /**
   * Acknowledge revocation events via mutation (skip HTTP middleman).
   */
  async acknowledgeRevocations(eventIds: string[]): Promise<void> {
    await this.client.mutation(
      anyApi.permissionRevocationEvents.acknowledgeMultiple,
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
