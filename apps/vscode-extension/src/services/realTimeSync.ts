import * as vscode from "vscode";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { SyncService } from "./sync";
import { StorageService } from "../utils/storage";
import {
  ConvexService,
  type CallerProjectAccess,
  type RevocationEvent,
  type TokenFetcher,
} from "./convex";
import { getConvexUrl } from "../utils/config";
import { captureError } from "../utils/sentry";
import type { LinkedProjectV2 } from "../types";

export class RealTimeSyncService {
  private convexService: ConvexService | null = null;
  private syncService: SyncService;
  private storage: StorageService;
  private getFreshToken: TokenFetcher;
  private revocationSubId: string | null = null;
  private accessSubId: string | null = null;
  private isRunning = false;
  private revocationQueue: Promise<void> = Promise.resolve();
  private refreshSubscriptionsQueue: Promise<void> = Promise.resolve();
  private desiredRunning = false;
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
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

  setConvexService(convexService: ConvexService): void {
    this.convexService = convexService;
  }

  async startRealTimeSync(): Promise<void> {
    this.desiredRunning = true;
    this.startReconnectTimer();

    if (this.isRunning || !this.convexService) {
      if (!this.convexService) {
        this.syncService.setConnectionState("disconnected");
      }
      return;
    }

    console.log("[RealTimeSync] Starting WebSocket subscriptions");
    this.isRunning = true;
    await this.setupSubscriptions().catch((error: unknown) => {
      this.isRunning = false;
      this.teardownSubscriptions();
      throw error;
    });
    this.syncService.setConnectionState("connected");
  }

  stopRealTimeSync(): void {
    console.log("[RealTimeSync] Stopping WebSocket subscriptions");
    this.desiredRunning = false;
    this.isRunning = false;
    this.teardownSubscriptions();
    this.stopReconnectTimer();
    this.syncService.setConnectionState("disconnected");
  }

  pause(): void {
    if (!this.isRunning && !this.reconnectTimer) return;
    console.log("[RealTimeSync] Pausing WebSocket subscriptions (idle)");
    this.isRunning = false;
    this.teardownSubscriptions();
    this.stopReconnectTimer();
    this.syncService.setConnectionState("disconnected");
  }

  async resume(): Promise<void> {
    if (this.isRunning) return;
    await this.startRealTimeSync();
  }

  private startReconnectTimer(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setInterval(() => {
      void this.checkConnectionAndReconnect();
    }, RealTimeSyncService.RECONNECT_CHECK_INTERVAL_MS);
    this.reconnectTimer.unref?.();
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async checkConnectionAndReconnect(): Promise<void> {
    if (!this.desiredRunning || this.reconnecting) return;
    if (
      this.convexService &&
      this.isRunning &&
      this.convexService.isAuthenticated
    )
      return;

    this.reconnecting = true;
    this.syncService.setConnectionState("reconnecting");
    try {
      if (!this.convexService) {
        const convexUrl = getConvexUrl();
        if (!convexUrl) {
          this.syncService.setConnectionState("disconnected");
          return;
        }
        const convexService = new ConvexService(convexUrl, this.getFreshToken);
        this.setConvexService(convexService);
        this.syncService.setConvexService(convexService);
      } else if (!this.convexService.isAuthenticated) {
        this.convexService.reauthenticate();
      }

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

  private async setupSubscriptions(): Promise<void> {
    if (!this.convexService) return;

    const linkedProjects = await this.storage.getLinkedProjectsV2();
    if (linkedProjects.length === 0) return;

    this.revocationSubId = this.convexService.subscribeToRevocations((events) =>
      this.enqueueRevocationWork(() => this.handleRevocationEvents(events))
    );

    this.accessSubId = this.convexService.subscribeToProjectAccess((records) =>
      this.enqueueRevocationWork(() => this.handleProjectAccessUpdate(records))
    );
  }

  private enqueueRevocationWork(task: () => Promise<void>): void {
    this.revocationQueue = this.revocationQueue.then(task).catch((error) => {
      captureError(error, { phase: "revocation-queue" });
    });
  }

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

  private async handleRevocationEvents(
    events: RevocationEvent[]
  ): Promise<void> {
    const linkedProjects = await this.storage.getLinkedProjectsV2();
    console.log(`[RealTimeSync] Detected ${events.length} revocation event(s)`);

    const eventIds = events.map((e) => e.eventId);

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

      await this.revokeProject(project, event.reason);
    }

    if (eventIds.length > 0 && this.convexService) {
      await this.acknowledgeWithRetry(this.convexService, eventIds, 3);
    }

    await this.refreshSubscriptions();
  }

  private async handleProjectAccessUpdate(
    records: Array<{ projectId: string }>
  ): Promise<void> {
    const linkedProjects = await this.storage.getLinkedProjectsV2();
    if (linkedProjects.length === 0) return;

    const activeProjectIds = new Set(records.map((r) => r.projectId));
    const orphaned = linkedProjects.filter(
      (p) => !activeProjectIds.has(p.projectId)
    );
    if (orphaned.length === 0) return;

    const authoritative = await this.fetchAuthoritativeAccessIds();
    if (!authoritative) {
      console.warn(
        "[RealTimeSync] Skipping access cleanup, authoritative re-check unavailable"
      );
      return;
    }
    const confirmed = orphaned.filter((p) => {
      if (authoritative.has(p.projectId)) {
        console.log(
          `[RealTimeSync] Snapshot lag for ${p.projectName}, access still active, skipping cleanup`
        );
        return false;
      }
      return true;
    });
    if (confirmed.length === 0) return;

    for (const project of confirmed) {
      console.log(
        `[RealTimeSync] Access ended for project: ${project.projectName}`
      );
      await this.revokeProject(project, "Access expired or revoked");
    }
    await this.refreshSubscriptions();
  }

  private async revokeProject(
    project: LinkedProjectV2,
    reason: string
  ): Promise<void> {
    this._onRevocationDetected.fire({ project, reason });
    await Promise.race([
      this.triggerRevocationCleanup(project, reason),
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

  private async fetchAuthoritativeAccessIds(): Promise<Set<string> | null> {
    try {
      const url = getConvexUrl();
      if (!url) return null;
      const token = await this.getFreshToken();
      if (!token) return null;
      const client = new ConvexHttpClient(url);
      client.setAuth(token);
      const records = (await Promise.race([
        client.query(
          anyApi.features.users.projectAccess.listForCaller as never,
          {} as never
        ),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Access re-check timed out")),
            10000
          )
        ),
      ])) as CallerProjectAccess[] | null;
      return new Set((records ?? []).map((r) => r.projectId));
    } catch (err) {
      captureError(err, { phase: "access-recheck" });
      return null;
    }
  }

  private async acknowledgeWithRetry(
    convexService: ConvexService,
    eventIds: string[],
    maxAttempts: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await convexService.acknowledgeRevocations(eventIds);
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

  private async triggerRevocationCleanup(
    project: LinkedProjectV2,
    reason: string
  ): Promise<void> {
    let spared: number;
    try {
      spared = await this.syncService.cleanupAllDirectories(project);
    } catch (error) {
      console.error(
        "[RealTimeSync] Failed to cleanup files after revocation:",
        error
      );
      vscode.window.showErrorMessage(
        `Access revoked for "${project.projectName}" but file cleanup failed. Please manually remove any .env files.`
      );
      return;
    }

    const removed =
      spared > 0
        ? `Synced .env files were removed, except ${spared} you edited locally.`
        : "All synced .env files have been removed.";
    vscode.window.showWarningMessage(
      `Access revoked for "${project.projectName}": ${reason}. ${removed}`,
      "OK"
    );
  }

  dispose(): void {
    this.stopRealTimeSync();
    void this.convexService?.dispose();
    this._onRevocationDetected.dispose();
  }
}
