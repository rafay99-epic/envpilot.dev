import * as vscode from "vscode";
import { ApiService } from "./api";
import { SyncService } from "./sync";
import { StorageService } from "../utils/storage";
import { getRealTimeSyncInterval } from "../utils/config";
import type { LinkedProjectV2, PermissionRevocationEvent } from "../types";

/**
 * Default interval for real-time sync polling (in milliseconds)
 * This is much shorter than the regular sync interval to enable near-real-time revocation detection
 */
const DEFAULT_REALTIME_INTERVAL = 5000; // 5 seconds

/**
 * Maximum backoff interval (30 seconds)
 */
const MAX_BACKOFF_INTERVAL = 30000;

/**
 * RealTimeSyncService handles real-time permission revocation detection
 *
 * This service polls the server frequently for permission revocation events
 * and immediately triggers the revocation handler when detected, ensuring
 * that cached environment variables are cleared promptly.
 */
export class RealTimeSyncService {
  private api: ApiService;
  private syncService: SyncService;
  private storage: StorageService;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private failureCount = 0;
  private readonly MAX_FAILURES = 5;

  private _onRevocationDetected = new vscode.EventEmitter<{
    project: LinkedProjectV2;
    reason: string;
  }>();

  readonly onRevocationDetected = this._onRevocationDetected.event;

  constructor(
    api: ApiService,
    syncService: SyncService,
    storage: StorageService
  ) {
    this.api = api;
    this.syncService = syncService;
    this.storage = storage;
  }

  /**
   * Start real-time sync polling
   * This should be called when the extension activates and user is authenticated
   */
  async startRealTimeSync(): Promise<void> {
    if (this.pollTimer) {
      return; // Already running
    }

    console.log("[RealTimeSync] Starting real-time permission sync");
    this.isPolling = true;
    this.failureCount = 0;
    this.scheduleNextPoll();
  }

  /**
   * Stop real-time sync polling
   */
  stopRealTimeSync(): void {
    console.log("[RealTimeSync] Stopping real-time permission sync");
    this.isPolling = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    this.failureCount = 0;
  }

  /**
   * Schedule the next poll with exponential backoff on failures
   */
  private scheduleNextPoll(): void {
    if (!this.isPolling) {
      return;
    }

    const baseInterval = getRealTimeSyncInterval() || DEFAULT_REALTIME_INTERVAL;
    const backoffMultiplier = Math.min(
      Math.pow(2, this.failureCount),
      MAX_BACKOFF_INTERVAL / baseInterval
    );
    const interval = Math.min(
      baseInterval * backoffMultiplier,
      MAX_BACKOFF_INTERVAL
    );

    this.pollTimer = setTimeout(async () => {
      await this.checkForRevocations();
      this.scheduleNextPoll();
    }, interval);
  }

  /**
   * Check for permission revocations across all linked projects
   */
  private async checkForRevocations(): Promise<void> {
    try {
      const linkedProjects = await this.storage.getLinkedProjectsV2();

      if (linkedProjects.length === 0) {
        // No linked projects, nothing to check
        this.failureCount = 0;
        return;
      }

      // Collect all access tokens
      const accessTokens = linkedProjects.map((p) => p.accessToken);

      // Check for revocation events
      const response = await this.api.checkPermissionEvents(accessTokens);

      if (response.hasRevocations && response.events.length > 0) {
        console.log(
          `[RealTimeSync] Detected ${response.events.length} revocation event(s)`
        );

        // Group events by access token for acknowledgment
        const eventsByToken = new Map<string, string[]>();

        // Process each revocation event
        for (const event of response.events) {
          await this.handleRevocationEvent(event, linkedProjects);

          // Group event IDs by access token
          if (!eventsByToken.has(event.accessToken)) {
            eventsByToken.set(event.accessToken, []);
          }
          eventsByToken.get(event.accessToken)!.push(event.eventId);
        }

        // Acknowledge the events for each token
        for (const [accessToken, eventIds] of eventsByToken) {
          try {
            await this.api.acknowledgeRevocations(eventIds, accessToken);
          } catch (error) {
            console.debug(
              "[RealTimeSync] Failed to acknowledge events:",
              error
            );
          }
        }
      }

      // Reset failure count on success
      this.failureCount = 0;
    } catch (error) {
      this.failureCount = Math.min(this.failureCount + 1, this.MAX_FAILURES);
      console.error("[RealTimeSync] Failed to check for revocations:", error);
    }
  }

  /**
   * Handle a single revocation event
   */
  private async handleRevocationEvent(
    event: {
      accessToken: string;
      eventId: string;
      projectId: string;
      userId: string;
      reason: string;
      revokedAt: number;
    },
    linkedProjects: LinkedProjectV2[]
  ): Promise<void> {
    // Find the project that matches this event
    const project = linkedProjects.find(
      (p) => p.accessToken === event.accessToken
    );

    if (!project) {
      console.warn(
        "[RealTimeSync] Revocation event for unknown project:",
        event.projectId
      );
      return;
    }

    console.log(
      `[RealTimeSync] Processing revocation for project: ${project.projectName}`
    );

    // Emit event for UI updates
    this._onRevocationDetected.fire({ project, reason: event.reason });

    // Trigger the sync service's revocation handler
    // This will clean up .env files and remove the linked project
    await this.triggerRevocationCleanup(project, event.reason);
  }

  /**
   * Trigger the revocation cleanup process
   * Clears cached variables and removes the linked project
   */
  private async triggerRevocationCleanup(
    project: LinkedProjectV2,
    reason: string
  ): Promise<void> {
    try {
      // Clean up all .env files for this project
      await this.syncService.cleanupAllDirectories(project);

      // Remove the linked project from storage
      await this.storage.removeLinkedProjectV2(project.projectId);

      // Show notification to user
      vscode.window.showWarningMessage(
        `Access revoked for "${project.projectName}": ${reason}. All synced .env files have been removed.`,
        "OK"
      );

      console.log(
        `[RealTimeSync] Cleanup completed for project: ${project.projectName}`
      );
    } catch (error) {
      console.error(
        "[RealTimeSync] Failed to cleanup after revocation:",
        error
      );

      // Still try to remove the project from storage even if cleanup fails
      try {
        await this.storage.removeLinkedProjectV2(project.projectId);
      } catch {
        // Ignore cleanup errors
      }

      vscode.window.showErrorMessage(
        `Access revoked for "${project.projectName}" but cleanup failed. Please manually remove any .env files.`
      );
    }
  }

  /**
   * Force an immediate check for revocations
   * Useful when the extension wants to verify permissions immediately
   */
  async checkNow(): Promise<boolean> {
    try {
      await this.checkForRevocations();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all cached variables for a specific project
   * This is called when a revocation is detected
   */
  async clearCachedVariables(project: LinkedProjectV2): Promise<void> {
    await this.syncService.cleanupAllDirectories(project);
  }

  dispose(): void {
    this.stopRealTimeSync();
    this._onRevocationDetected.dispose();
  }
}
