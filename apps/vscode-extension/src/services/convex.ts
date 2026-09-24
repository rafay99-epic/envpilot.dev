import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";
import * as output from "../utils/outputChannel";

function onSubscriptionError(label: string) {
  return (err: Error) => output.warn(`${label} subscription: ${err.message}`);
}

export type TokenFetcher = (args?: {
  forceRefreshToken: boolean;
}) => Promise<string | null>;

export interface CallerProjectAccess {
  _id: string;
  projectId: string;
  deviceId?: string;
  deviceName?: string;
  expiresAt: number;
}

export interface RevocationEvent {
  accessToken: string;
  eventId: string;
  projectId: string;
  userId: string;
  reason: string;
  revokedAt: number;
}

export class ConvexService {
  private client: ConvexClient;
  private subscriptions = new Map<string, () => void>();
  private nextSubscriptionId = 0;
  private _disposed = false;
  private fetcher: TokenFetcher;
  private _authenticated = true;
  private reauthTimer: ReturnType<typeof setTimeout> | null = null;
  private reauthAttempt = 0;
  private static readonly REAUTH_DELAYS_MS = [5_000, 15_000, 60_000];
  private static readonly REAUTH_CAP_MS = 3 * 60 * 1000;

  constructor(convexUrl: string, getFreshToken: TokenFetcher) {
    this.client = new ConvexClient(convexUrl);
    this.fetcher = (args) => getFreshToken(args).catch(() => null);
    this.applyAuth();
  }

  private applyAuth(): void {
    this.client.setAuth(this.fetcher, (isAuthenticated) => {
      this._authenticated = isAuthenticated;
      if (isAuthenticated) {
        this.reauthAttempt = 0;
        this.clearReauthTimer();
      } else if (!this._disposed) {
        this.scheduleReauth();
      }
    });
  }

  get isAuthenticated(): boolean {
    return this._authenticated;
  }

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

  subscribeToRevocations(
    callback: (events: RevocationEvent[]) => void
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
      onSubscriptionError("revocations")
    );

    this.subscriptions.set(id, unsubscribe);
    return id;
  }

  subscribeToProjectAccess(
    callback: (records: CallerProjectAccess[]) => void
  ): string {
    const id = `access-${this.nextSubscriptionId++}`;

    const unsubscribe = this.client.onUpdate(
      anyApi.features.users.projectAccess.listForCaller,
      {},
      (records: unknown) => {
        callback((records as CallerProjectAccess[]) ?? []);
      },
      onSubscriptionError("project access")
    );

    this.subscriptions.set(id, unsubscribe);
    return id;
  }

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
    const id = `vars-${projectId}-${this.nextSubscriptionId++}`;

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
      onSubscriptionError("variable metadata")
    );

    this.subscriptions.set(id, unsubscribe);
    return id;
  }

  async acknowledgeRevocations(eventIds: string[]): Promise<void> {
    await this.client.mutation(
      anyApi.features.permissions.revocationEvents.acknowledgeMine,
      { eventIds }
    );
  }

  unsubscribe(id: string): void {
    const unsub = this.subscriptions.get(id);
    if (unsub) {
      unsub();
      this.subscriptions.delete(id);
    }
  }

  unsubscribeAll(): void {
    for (const unsub of this.subscriptions.values()) {
      unsub();
    }
    this.subscriptions.clear();
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    this.clearReauthTimer();
    this.unsubscribeAll();
    await this.client.close();
  }
}
