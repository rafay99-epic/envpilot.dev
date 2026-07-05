import * as vscode from "vscode";
import { SyncService } from "./sync";
import { StorageService } from "../utils/storage";
import { ConvexService, type RevocationEvent, type TokenFetcher } from "./convex";
import { getConvexUrl, getServerUrl } from "../utils/config";
import { captureError } from "../utils/sentry";
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
  private getFreshToken: TokenFetcher;
  private revocationSubId: string | null = null;
  private accessSubId: string | null = null;
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

  constructor(
    syncService: SyncService,
    storage: StorageService,
    getFreshToken: TokenFetcher
  ) {
    this.syncService = syncService;
    this.storage = storage;
    this.getFreshToken = getFreshToken;
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
        const convexService = new ConvexService(convexUrl, this.getFreshToken);
        this.setConvexService(convexService);
        this.syncService.setConvexService(convexService);
      }

      // Let startRealTimeSync (re-)establish subscriptions now that a
      // connection exists.
      this.isRunning = false;
      await this.startRealTimeSync();
      this.syncService.startPeriodicSync();
    } catch (error) {
      captureError(error, { phase: "realtime-reconnect" });
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
    } catch (err) {
      captureError(err, { phase: "convex-url-resolve" });
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

    // Identity-scoped revocation events (no access tokens passed). Match each
    // event to a linked project by projectId.
    this.revocationSubId = this.convexService.subscribeToRevocations((events) =>
      this.handleRevocationEvents(events, linkedProjects)
    );

    // Identity-scoped set of the caller's still-active project accesses. When a
    // linked project drops out of this set, its access has ended.
    this.accessSubId = this.convexService.subscribeToProjectAccess((records) =>
      this.handleProjectAccessUpdate(records)
    );
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

    if (this.accessSubId) {
      this.convexService.unsubscribe(this.accessSubId);
      this.accessSubId = null;
    }
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
    events: RevocationEvent[],
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

      // Acknowledge EVERY delivered event id (identity-scoped server-side), so
      // an event for a project we no longer track locally doesn't loop forever.
      const eventIds = events.map((e) => e.eventId);

      // Deduplicate by projectId — clean up each affected project only once.
      const seen = new Set<string>();
      const deduped = events.filter((e) => {
        if (seen.has(e.projectId)) return false;
        seen.add(e.projectId);
        return true;
      });

      for (const event of deduped) {
        const project = linkedProjects.find(
          (p) => p.projectId === event.projectId
        );

        if (!project) {
          console.warn("[RealTimeSync] Revocation event for unknown project");
          continue;
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
          captureError(err, { phase: "revocation-cleanup-race" });
          console.error("[RealTimeSync] Cleanup error:", err);
        });
      }

      // Acknowledge events with retry (up to 3 attempts)
      if (eventIds.length > 0 && this.convexService) {
        await this.acknowledgeWithRetry(eventIds, 3);
      }

      // Refresh subscriptions since projects were removed
      await this.refreshSubscriptions();
    } finally {
      this.isProcessingRevocation = false;
    }
  }

  /**
   * React to the caller's live set of active project accesses. Any locally
   * linked project that is NOT in the active set has had its access end
   * (expired/revoked out-of-band) — clean it up as if revoked.
   */
  private async handleProjectAccessUpdate(
    records: Array<{ projectId: string }>
  ): Promise<void> {
    if (this.isProcessingRevocation) {
      return;
    }

    const linkedProjects = await this.storage.getLinkedProjectsV2();
    if (linkedProjects.length === 0) return;

    const activeProjectIds = new Set(records.map((r) => r.projectId));
    const orphaned = linkedProjects.filter(
      (p) => !activeProjectIds.has(p.projectId)
    );
    if (orphaned.length === 0) return;

    this.isProcessingRevocation = true;
    try {
      for (const project of orphaned) {
        console.log(
          `[RealTimeSync] Access ended for project: ${project.projectName}`
        );
        this._onRevocationDetected.fire({
          project,
          reason: "Access expired or revoked",
        });
        await Promise.race([
          this.triggerRevocationCleanup(
            project,
            "Access expired or revoked"
          ),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error("Revocation cleanup timed out")),
              30000
            )
          ),
        ]).catch((err) => {
          captureError(err, { phase: "revocation-cleanup-race" });
          console.error("[RealTimeSync] Cleanup error:", err);
        });
      }
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
    maxAttempts: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.convexService!.acknowledgeRevocations(eventIds);
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
