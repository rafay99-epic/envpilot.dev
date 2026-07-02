import * as vscode from "vscode";
import { SyncService } from "./sync";
import { StorageService } from "../utils/storage";
import { ConvexService } from "./convex";
import { getConvexUrl, getServerUrl } from "../utils/config";
import type { LinkedProjectV2 } from "../types";

/**
 * RealTimeSyncService handles real-time permission revocation detection
 * via Convex WebSocket subscriptions.
 *
 * Before: HTTP polling every 5s → 720 calls/hr/user
 * After: 1 WebSocket subscription, fires reactively on change → 0 HTTP calls
 */
export class RealTimeSyncService {
  private convexService: ConvexService | null = null;
  private syncService: SyncService;
  private storage: StorageService;
  private revocationSubId: string | null = null;
  private tokenSubIds: string[] = [];
  private isRunning = false;
  private isProcessingRevocation = false;
  /** Serializes refreshSubscriptions() calls (mirrors sync.ts /
   * StorageService.metadataWriteQueue) so concurrent callers — a revocation
   * cleanup and a project link happening back to back — can't race on
   * subscription-id teardown/setup. */
  private refreshSubscriptionsQueue: Promise<void> = Promise.resolve();
  /** True once startRealTimeSync() has been asked to run — distinct from
   * `isRunning` (which reflects whether subscriptions are actually up), so
   * the reconnect timer knows whether it should keep retrying after a
   * connection that never came up, without resurrecting sync after an
   * explicit stopRealTimeSync() (e.g. sign-out). */
  private desiredRunning = false;
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  /** Low-frequency bounded-backoff check — NOT a replacement for the
   * WebSocket subscriptions, just a backstop for when Convex never connected
   * in the first place (e.g. a proxy blocking the wss:// upgrade) or the
   * connection got torn down without ever coming back up. */
  private static readonly RECONNECT_CHECK_INTERVAL_MS = 3 * 60 * 1000;

  private _onRevocationDetected = new vscode.EventEmitter<{
    project: LinkedProjectV2;
    reason: string;
  }>();

  readonly onRevocationDetected = this._onRevocationDetected.event;

  constructor(syncService: SyncService, storage: StorageService) {
    this.syncService = syncService;
    this.storage = storage;
  }

  /**
   * Set the ConvexService instance (called after Convex URL is resolved).
   */
  setConvexService(convexService: ConvexService): void {
    this.convexService = convexService;
  }

  /**
   * Start real-time sync via WebSocket subscriptions.
   */
  async startRealTimeSync(): Promise<void> {
    this.desiredRunning = true;
    // Always arm the reconnect backstop once sync is desired — even if this
    // particular attempt no-ops below because Convex isn't ready yet, so a
    // connection that never comes up gets retried instead of silently
    // staying dead forever.
    this.startReconnectTimer();

    if (this.isRunning || !this.convexService) {
      if (!this.convexService) {
        this.syncService.setConnectionState("disconnected");
      }
      return;
    }

    console.log("[RealTimeSync] Starting WebSocket subscriptions");
    this.isRunning = true;
    await this.setupSubscriptions();
    this.syncService.setConnectionState("connected");
  }

  /**
   * Stop real-time sync — unsubscribe from all WebSocket subscriptions.
   */
  stopRealTimeSync(): void {
    console.log("[RealTimeSync] Stopping WebSocket subscriptions");
    this.desiredRunning = false;
    this.isRunning = false;
    this.teardownSubscriptions();
    this.stopReconnectTimer();
    this.syncService.setConnectionState("disconnected");
  }

  /**
   * Low-frequency (every few minutes) check for whether the WebSocket
   * connection is up; only acts when disconnected. Bounded and cheap — this
   * is a backstop, not a polling replacement for the subscriptions.
   */
  private startReconnectTimer(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setInterval(() => {
      void this.checkConnectionAndReconnect();
    }, RealTimeSyncService.RECONNECT_CHECK_INTERVAL_MS);
    // Never let this backstop timer keep the extension host process alive.
    this.reconnectTimer.unref?.();
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Retry establishing the Convex connection/subscriptions if real-time sync
   * is supposed to be running but isn't currently connected. Handles both
   * "Convex never connected at all" (auto-detect failed at activation, no
   * retry existed before this) and "subscriptions got torn down without
   * coming back up".
   */
  private async checkConnectionAndReconnect(): Promise<void> {
    if (!this.desiredRunning || this.reconnecting) return;
    if (this.convexService && this.isRunning) return; // already healthy

    this.reconnecting = true;
    this.syncService.setConnectionState("reconnecting");
    try {
      if (!this.convexService) {
        const convexUrl = await this.resolveConvexUrl();
        if (!convexUrl) {
          this.syncService.setConnectionState("disconnected");
          return;
        }
        const convexService = new ConvexService(convexUrl);
        this.setConvexService(convexService);
        this.syncService.setConvexService(convexService);
      }

      // Let startRealTimeSync (re-)establish subscriptions now that a
      // connection exists.
      this.isRunning = false;
      await this.startRealTimeSync();
      this.syncService.startPeriodicSync();
    } catch (error) {
      console.error("[RealTimeSync] Reconnect attempt failed:", error);
      this.syncService.setConnectionState("disconnected");
    } finally {
      this.reconnecting = false;
    }
  }

  /**
   * Resolve the Convex URL the same way activation does: configured setting
   * first, then auto-detect from the server config endpoint.
   */
  private async resolveConvexUrl(): Promise<string | null> {
    const configured = getConvexUrl();
    if (configured) return configured;

    try {
      const axios = (await import("axios")).default;
      const response = await axios.get(
        `${getServerUrl()}/api/extension/config`,
        { timeout: 5000 }
      );
      return response.data?.convexUrl || null;
    } catch {
      return null;
    }
  }

  /**
   * Set up WebSocket subscriptions for all linked projects.
   */
  private async setupSubscriptions(): Promise<void> {
    if (!this.convexService) return;

    const linkedProjects = await this.storage.getLinkedProjectsV2();
    if (linkedProjects.length === 0) return;

    // Subscribe to revocation events for all access tokens
    const accessTokens = linkedProjects.map((p) => p.accessToken);

    this.revocationSubId = this.convexService.subscribeToRevocations(
      accessTokens,
      (events) => this.handleRevocationEvents(events, linkedProjects)
    );

    // Subscribe to token validation for each project
    for (const project of linkedProjects) {
      const subId = this.convexService.subscribeToTokenValidation(
        project.accessToken,
        (result) => {
          if (result === null) {
            // Token is invalid/expired — trigger revocation
            this.handleTokenInvalid(project);
          }
        }
      );
      this.tokenSubIds.push(subId);
    }
  }

  /**
   * Tear down all subscriptions.
   */
  private teardownSubscriptions(): void {
    if (!this.convexService) return;

    if (this.revocationSubId) {
      this.convexService.unsubscribe(this.revocationSubId);
      this.revocationSubId = null;
    }

    for (const subId of this.tokenSubIds) {
      this.convexService.unsubscribe(subId);
    }
    this.tokenSubIds = [];
  }

  /**
   * Refresh subscriptions when projects are linked/unlinked. Queued (not
   * just awaited) so concurrent callers can't interleave teardown/setup and
   * orphan a live subscription or drop one that should exist.
   */
  async refreshSubscriptions(): Promise<void> {
    const task = this.refreshSubscriptionsQueue.then(() =>
      this.doRefreshSubscriptions()
    );
    this.refreshSubscriptionsQueue = task.catch(() => {});
    return task;
  }

  private async doRefreshSubscriptions(): Promise<void> {
    if (!this.isRunning) return;
    this.teardownSubscriptions();
    await this.setupSubscriptions();
  }

  /**
   * Handle incoming revocation events from WebSocket subscription.
   * Deduplicates by access token and processes with a timeout guard.
   */
  private async handleRevocationEvents(
    events: Array<{
      accessToken: string;
      eventId: string;
      projectId: string;
      userId: string;
      reason: string;
      revokedAt: number;
    }>,
    linkedProjects: LinkedProjectV2[]
  ): Promise<void> {
    if (this.isProcessingRevocation) {
      return; // Avoid concurrent revocation processing
    }
    this.isProcessingRevocation = true;

    try {
      console.log(
        `[RealTimeSync] Detected ${events.length} revocation event(s)`
      );

      const eventIds: string[] = [];
      // Every revocation event delivered to this extension belongs to the
      // signed-in user, so any event's userId identifies the acknowledging
      // user for the backend ownership check.
      const revocationUserId = events[0]?.userId;

      // Deduplicate events by access token — process each token only once
      const seen = new Set<string>();
      const deduped = events.filter((e) => {
        if (seen.has(e.accessToken)) return false;
        seen.add(e.accessToken);
        return true;
      });

      for (const event of deduped) {
        const project = linkedProjects.find(
          (p) => p.accessToken === event.accessToken
        );

        if (!project) {
          console.warn("[RealTimeSync] Revocation event for unknown project");
          continue;
        }

        // Collect all event IDs for this token (including duplicates)
        for (const e of events) {
          if (e.accessToken === event.accessToken) {
            eventIds.push(e.eventId);
          }
        }

        // Emit event for UI updates
        this._onRevocationDetected.fire({ project, reason: event.reason });

        // Trigger cleanup with timeout
        await Promise.race([
          this.triggerRevocationCleanup(project, event.reason),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error("Revocation cleanup timed out")),
              30000
            )
          ),
        ]).catch((err) => {
          console.error("[RealTimeSync] Cleanup error:", err);
        });
      }

      // Acknowledge events with retry (up to 3 attempts)
      if (eventIds.length > 0 && this.convexService && revocationUserId) {
        await this.acknowledgeWithRetry(eventIds, revocationUserId, 3);
      }

      // Refresh subscriptions since projects were removed
      await this.refreshSubscriptions();
    } finally {
      this.isProcessingRevocation = false;
    }
  }

  /**
   * Acknowledge revocation events with exponential backoff retry.
   */
  private async acknowledgeWithRetry(
    eventIds: string[],
    userId: string,
    maxAttempts: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.convexService!.acknowledgeRevocations(eventIds, userId);
        return;
      } catch (error) {
        console.debug(
          `[RealTimeSync] Acknowledge attempt ${attempt}/${maxAttempts} failed:`,
          error
        );
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }

  /**
   * Handle token becoming invalid (detected via WebSocket subscription).
   */
  private async handleTokenInvalid(project: LinkedProjectV2): Promise<void> {
    if (this.isProcessingRevocation) {
      return;
    }
    this.isProcessingRevocation = true;

    try {
      console.log(
        `[RealTimeSync] Token invalid for project: ${project.projectName}`
      );

      this._onRevocationDetected.fire({
        project,
        reason: "Access token expired or revoked",
      });

      await Promise.race([
        this.triggerRevocationCleanup(
          project,
          "Access token expired or revoked"
        ),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error("Revocation cleanup timed out")),
            30000
          )
        ),
      ]).catch((err) => {
        console.error("[RealTimeSync] Cleanup error:", err);
      });

      await this.refreshSubscriptions();
    } finally {
      this.isProcessingRevocation = false;
    }
  }

  /**
   * Trigger the revocation cleanup process.
   * Ensures files are deleted before removing the project from storage.
   */
  private async triggerRevocationCleanup(
    project: LinkedProjectV2,
    reason: string
  ): Promise<void> {
    let cleanupSucceeded = false;

    try {
      await this.syncService.cleanupAllDirectories(project);
      cleanupSucceeded = true;
    } catch (error) {
      console.error(
        "[RealTimeSync] Failed to cleanup files after revocation:",
        error
      );
    }

    // Always remove project from storage (access is revoked regardless)
    try {
      await this.storage.removeLinkedProjectV2(project.projectId);
    } catch {
      // Storage removal failed — will be cleaned up on next sync
    }

    if (cleanupSucceeded) {
      vscode.window.showWarningMessage(
        `Access revoked for "${project.projectName}": ${reason}. All synced .env files have been removed.`,
        "OK"
      );
    } else {
      vscode.window.showErrorMessage(
        `Access revoked for "${project.projectName}" but file cleanup failed. Please manually remove any .env files.`
      );
    }
  }

  /**
   * Force an immediate check (triggers subscription refresh).
   */
  async checkNow(): Promise<boolean> {
    try {
      await this.refreshSubscriptions();
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.stopRealTimeSync();
    // If the bounded-backoff reconnect ever self-created a ConvexService
    // (the original connection never came up at activation), extension.ts's
    // own convexService?.dispose() call won't know about it — dispose it
    // here too. ConvexService.dispose() is idempotent, so this is also safe
    // in the common case where it's the same shared instance.
    void this.convexService?.dispose();
    this._onRevocationDetected.dispose();
  }
}
