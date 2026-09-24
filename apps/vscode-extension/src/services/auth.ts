import * as vscode from "vscode";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getConvexUrl, getWorkosClientId } from "../utils/config";
import { openUrlReliably } from "../utils/browser";
import * as output from "../utils/outputChannel";
import { captureError } from "../utils/sentry";
import { StorageService } from "../utils/storage";
import { TokenManager } from "./tokenManager";
import { getDeviceName } from "../utils/device";
import { getJwtSessionId, getJwtSubject } from "../utils/jwt";
import {
  requestDeviceCode,
  pollForToken,
  type DeviceCodeResponse,
  type TokenResponse,
} from "./workos";
import type { AuthSession, User } from "../types";

const MAX_CONSECUTIVE_ERRORS = 5;

export class AuthService {
  private storage: StorageService;
  private tokenManager: TokenManager;
  private _onAuthStateChanged = new vscode.EventEmitter<AuthSession | null>();
  readonly onAuthStateChanged = this._onAuthStateChanged.event;
  private sessionDeadSubscription: vscode.Disposable;

  constructor(storage: StorageService, tokenManager: TokenManager) {
    this.storage = storage;
    this.tokenManager = tokenManager;
    this.sessionDeadSubscription = tokenManager.onSessionDead(() => {
      void this.fireCurrentSession();
    });
  }

  private async fireCurrentSession(): Promise<void> {
    this._onAuthStateChanged.fire(await this.storage.getAuthSession());
  }

  async signIn(): Promise<boolean> {
    if (!getWorkosClientId()) {
      vscode.window.showErrorMessage(
        "Envpilot: this build has no WorkOS client id embedded. Reinstall the extension."
      );
      return false;
    }

    output.log("signIn.start");

    let device: DeviceCodeResponse;
    try {
      device = await requestDeviceCode();
    } catch (err) {
      captureError(err, { phase: "device-code-request" });
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Envpilot: sign-in failed: ${message}`);
      return false;
    }

    await this.presentDeviceCode(device);

    return this.pollForAuthCompletion(device);
  }

  private async presentDeviceCode(device: DeviceCodeResponse): Promise<void> {
    output.log("signIn.device_code", {
      user_code: device.user_code,
    });

    await vscode.env.clipboard
      .writeText(device.user_code)
      .then(undefined, () => undefined);

    const opened = await openUrlReliably(device.verification_uri_complete);
    if (opened) {
      output.log("signIn.browser_opened");
      vscode.window.showInformationMessage(
        `Envpilot: confirm the code "${device.user_code}" in your browser to finish signing in.`
      );
    } else {
      output.warn("signIn.browser_open_failed");
      const action = await vscode.window.showWarningMessage(
        `Envpilot: open ${device.verification_uri_complete} and enter code "${device.user_code}" to sign in. The URL has been copied to your clipboard.`,
        "Show Output Log"
      );
      await vscode.env.clipboard
        .writeText(device.verification_uri_complete)
        .then(undefined, () => undefined);
      if (action === "Show Output Log") {
        output.show();
      }
    }
  }

  private async pollForAuthCompletion(
    device: DeviceCodeResponse
  ): Promise<boolean> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Envpilot: Waiting for sign-in...",
        cancellable: true,
      },
      async (progress, cancellationToken) => {
        progress.report({ message: "Complete sign-in in your browser" });

        let intervalMs = device.interval * 1000;
        const deadline = Date.now() + device.expires_in * 1000;
        let consecutiveErrors = 0;
        let firstPoll = true;

        while (
          !cancellationToken.isCancellationRequested &&
          Date.now() < deadline
        ) {
          if (!firstPoll) {
            const disposables: vscode.Disposable[] = [];
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, intervalMs);
              disposables.push(
                cancellationToken.onCancellationRequested(() => {
                  clearTimeout(timer);
                  resolve();
                })
              );
            });
            disposables.forEach((d) => d.dispose());
          }
          firstPoll = false;
          if (cancellationToken.isCancellationRequested) {
            break;
          }

          progress.report({
            message: `Waiting for browser sign-in... (${Math.floor(
              (deadline - Date.now()) / 1000
            )}s left)`,
          });

          const result = await pollForToken(device.device_code);

          if (result.status === "complete") {
            return this.completeLogin(result.token);
          }

          switch (result.status) {
            case "pending":
              consecutiveErrors = 0;
              break;
            case "slow_down":
              consecutiveErrors = 0;
              intervalMs += 5000;
              break;
            case "network":
              consecutiveErrors++;
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                output.warn("signIn.network_errors");
                vscode.window.showErrorMessage(
                  "Envpilot: too many network errors while signing in. Check your connection and try again."
                );
                return false;
              }
              break;
            case "denied":
              vscode.window.showWarningMessage(
                "Envpilot: sign-in was denied. Please try again."
              );
              return false;
            case "expired":
              vscode.window.showWarningMessage(
                "Envpilot: the sign-in code expired. Please try again."
              );
              return false;
            case "error":
              vscode.window.showErrorMessage(
                "Envpilot: WorkOS returned an unexpected sign-in response. Please try again."
              );
              return false;
          }
        }

        if (cancellationToken.isCancellationRequested) {
          output.warn("signIn.cancelled");
          return false;
        }

        output.warn("signIn.timeout");
        vscode.window.showWarningMessage(
          "Envpilot: sign-in timed out. Please try again."
        );
        return false;
      }
    );
  }

  private async completeLogin(token: TokenResponse): Promise<boolean> {
    const session = this.sessionFromToken(token);

    await this.storage.setAuthSession(session);
    this._onAuthStateChanged.fire(session);

    output.log("signIn.success", { user: session.user.email });

    await this.recordDeviceSession(session, token.access_token);

    vscode.window.showInformationMessage(`Signed in as ${session.user.email}`);
    return true;
  }

  private sessionFromToken(token: TokenResponse): AuthSession {
    const workosUser = token.user;
    const userId = workosUser?.id ?? getJwtSubject(token.access_token);
    if (!userId) {
      throw new Error("WorkOS returned a session with no user id.");
    }
    const email = workosUser?.email || `${userId}@extension.local`;
    const name =
      [workosUser?.first_name, workosUser?.last_name]
        .filter(Boolean)
        .join(" ") || null;

    const user: User = {
      id: userId,
      email,
      name,
      avatarUrl: null,
    };

    return {
      user,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: 0,
      sessionId: getJwtSessionId(token.access_token) ?? undefined,
    };
  }

  private async recordDeviceSession(
    session: AuthSession,
    accessToken: string
  ): Promise<void> {
    if (!session.sessionId) return;
    try {
      const client = this.buildConvexClient(accessToken);
      if (!client) return;
      await client.mutation(anyApi.features.users.deviceSessions.record, {
        deviceName: getDeviceName(),
        clientType: "extension",
        sessionId: session.sessionId,
      });
    } catch (err) {
      captureError(err, { phase: "device-session-record" });
    }
  }

  private async revokeDeviceSession(session: AuthSession): Promise<void> {
    if (!session.sessionId) return;
    try {
      const token = await this.tokenManager.getFreshTokenForAccount(session);
      const client = this.buildConvexClient(token);
      if (!client) return;
      await client.mutation(anyApi.features.users.deviceSessions.revoke, {
        sessionId: session.sessionId,
      });
    } catch (err) {
      captureError(err, { phase: "device-session-revoke" });
    }
  }

  private buildConvexClient(token: string | null): ConvexHttpClient | null {
    const url = getConvexUrl();
    if (!url || !token) return null;
    const client = new ConvexHttpClient(url);
    client.setAuth(token);
    return client;
  }

  async signOut(): Promise<void> {
    const session = await this.getSession();
    if (session) {
      await this.revokeDeviceSession(session);
      this.tokenManager.clearInflightFor(session.user.id);
      await this.storage.removeAccount(session.user.id, { promote: true });
    }
    await this.fireCurrentSession();
    vscode.window.showInformationMessage("Signed out of Envpilot");
  }

  async getSession(): Promise<AuthSession | null> {
    return this.storage.getAuthSession();
  }

  async listAccounts(): Promise<AuthSession[]> {
    return this.storage.listAccounts();
  }

  async getActiveAccountId(): Promise<string | undefined> {
    return this.storage.getActiveAccountId();
  }

  async switchAccount(userId: string): Promise<boolean> {
    const switched = await this.storage.setActiveAccount(userId);
    if (switched) {
      await this.fireCurrentSession();
    }
    return switched;
  }

  async signOutAll(): Promise<void> {
    for (const account of await this.storage.listAccounts()) {
      await this.revokeDeviceSession(account);
    }
    this.tokenManager.clearInflight();
    await this.storage.clearAllAccounts();
    this._onAuthStateChanged.fire(null);
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }

  async getCurrentUser(): Promise<User | null> {
    const session = await this.getSession();
    return session?.user || null;
  }

  dispose(): void {
    this.sessionDeadSubscription.dispose();
    this._onAuthStateChanged.dispose();
  }
}
