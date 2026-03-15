import * as vscode from "vscode";
import { SyncService } from "./sync";
import { StorageService } from "../utils/storage";
import { ConvexService } from "./convex";
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
    if (this.isRunning || !this.convexService) {
      return;
    }

    console.log("[RealTimeSync] Starting WebSocket subscriptions");
    this.isRunning = true;
    await this.setupSubscriptions();
  }

  /**
   * Stop real-time sync — unsubscribe from all WebSocket subscriptions.
   */
  stopRealTimeSync(): void {
    console.log("[RealTimeSync] Stopping WebSocket subscriptions");
    this.isRunning = false;
    this.teardownSubscriptions();
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
   * Refresh subscriptions when projects are linked/unlinked.
   */
  async refreshSubscriptions(): Promise<void> {
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
    this._onRevocationDetected.dispose();
  }
}
