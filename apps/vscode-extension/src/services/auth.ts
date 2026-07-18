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
  WorkosAuthError,
  type DeviceCodeResponse,
  type TokenResponse,
} from "./workos";
import type { AuthSession, User } from "../types";

const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Authentication service for the extension.
 *
 * Uses the WorkOS AuthKit **device authorization flow**: it requests a device +
 * user code, opens the verification URL in the browser, and polls WorkOS until
 * the user approves. The resulting AuthKit JWTs (access + refresh) are stored in
 * VS Code SecretStorage via {@link StorageService}. Token freshness is owned by
 * {@link TokenManager}; this service only mints the initial session and records
 * / revokes the WorkOS device session for the active-sessions UI.
 */
export class AuthService {
  private storage: StorageService;
  private tokenManager: TokenManager;
  private _onAuthStateChanged = new vscode.EventEmitter<AuthSession | null>();
  readonly onAuthStateChanged = this._onAuthStateChanged.event;

  constructor(storage: StorageService, tokenManager: TokenManager) {
    this.storage = storage;
    this.tokenManager = tokenManager;
  }

  /**
   * Run the WorkOS device-authorization login flow. Returns true on success.
   */
  async signIn(): Promise<boolean> {
    if (!getWorkosClientId()) {
      vscode.window.showErrorMessage(
        "Envpilot: this build has no WorkOS client id embedded. Reinstall the extension."
      );
      return false;
    }

    output.logEvent("signIn.start");

    let device: DeviceCodeResponse;
    try {
      device = await requestDeviceCode();
    } catch (err) {
      captureError(err, { phase: "device-code-request" });
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Envpilot: sign-in failed — ${message}`);
      return false;
    }

    await this.presentDeviceCode(device);

    return this.pollForAuthCompletion(device);
  }

  /**
   * Show the user code and open the verification URL in the browser (also
   * copies the URL to the clipboard as a safety net).
   */
  private async presentDeviceCode(device: DeviceCodeResponse): Promise<void> {
    output.logEvent("signIn.device_code", {
      user_code: device.user_code,
    });

    // Copy the code so the user can paste it if the page asks for it.
    try {
      await vscode.env.clipboard.writeText(device.user_code);
    } catch {
      // Non-fatal.
    }

    const opened = await openUrlReliably(device.verification_uri_complete);
    if (opened) {
      output.logEvent("signIn.browser_opened");
      vscode.window.showInformationMessage(
        `Envpilot: confirm the code "${device.user_code}" in your browser to finish signing in.`
      );
    } else {
      output.warnEvent("signIn.browser_open_failed");
      const action = await vscode.window.showWarningMessage(
        `Envpilot: open ${device.verification_uri_complete} and enter code "${device.user_code}" to sign in. The URL has been copied to your clipboard.`,
        "Show Output Log"
      );
      try {
        await vscode.env.clipboard.writeText(device.verification_uri_complete);
      } catch {
        // Non-fatal.
      }
      if (action === "Show Output Log") {
        output.show();
      }
    }
  }

  /**
   * Poll WorkOS for approval with a cancellable progress notification. WorkOS
   * dictates the poll cadence (interval, may increase on slow_down) and the
   * overall window (expires_in).
   */
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
          // Skip the delay before the FIRST poll — the user has already been
          // sent to the browser, so check WorkOS immediately rather than
          // waiting a full interval before the first attempt. The wait is
          // cancellation-aware: cancelling sign-in resolves immediately instead
          // of blocking for the full interval (the listener is always disposed).
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
            // Resolved by the timer OR by cancellation — dispose the listener
            // either way so it doesn't accumulate across poll iterations.
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
                output.warnEvent("signIn.network_errors");
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
          }
        }

        if (cancellationToken.isCancellationRequested) {
          output.warnEvent("signIn.cancelled");
          return false;
        }

        output.warnEvent("signIn.timeout");
        vscode.window.showWarningMessage(
          "Envpilot: sign-in timed out. Please try again."
        );
        return false;
      }
    );
  }

  /**
   * Persist the AuthKit tokens as the active account, record the device session,
   * and notify listeners.
   */
  private async completeLogin(token: TokenResponse): Promise<boolean> {
    const session = this.sessionFromToken(token);

    await this.storage.setAuthSession(session);
    this._onAuthStateChanged.fire(session);

    output.logEvent("signIn.success", { user: session.user.email });

    // Best-effort — never block a successful login.
    await this.recordDeviceSession(session, token.access_token);

    vscode.window.showInformationMessage(`Signed in as ${session.user.email}`);
    return true;
  }

  /** Build an AuthSession from a WorkOS token response. */
  private sessionFromToken(token: TokenResponse): AuthSession {
    const workosUser = token.user;
    const userId =
      workosUser?.id ??
      getJwtSubject(token.access_token) ??
      `session-${token.access_token.slice(0, 8)}`;
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
      // 0 = never auto-evict on a timestamp; session death is refresh-driven.
      expiresAt: 0,
      sessionId: getJwtSessionId(token.access_token) ?? undefined,
    };
  }

  /**
   * Record this device as an active WorkOS session (best-effort). Uses the
   * just-obtained access token directly so it works even before the token
   * manager has cached anything.
   */
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
      // Non-fatal — the session record is a convenience, not load-bearing.
      captureError(err, { phase: "device-session-record" });
    }
  }

  /** Best-effort remote revoke of a WorkOS session by its session id. */
  /**
   * Revoke a specific account's WorkOS device session. Authenticates with THAT
   * account's own token (deviceSessions.revoke is identity-scoped — the active
   * account's token cannot revoke another user's session).
   */
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
      // Non-fatal — local credentials are cleared regardless.
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

  /**
   * Sign out of the ACTIVE account: revoke its WorkOS session (best-effort),
   * then clear its stored credentials.
   */
  async signOut(): Promise<void> {
    const session = await this.getSession();
    if (session) {
      await this.revokeDeviceSession(session);
      // Abandon any in-flight refresh for THIS account so it can't hand back
      // a token after the account is cleared — other signed-in accounts'
      // refreshes must keep running.
      this.tokenManager.clearInflightFor(session.user.id);
    }
    await this.storage.clearAuthSession();
    this._onAuthStateChanged.fire(null);
    vscode.window.showInformationMessage("Signed out of Envpilot");
  }

  /** Get the current active account's auth session, or null when signed out. */
  async getSession(): Promise<AuthSession | null> {
    return this.storage.getAuthSession();
  }

  // ============================================
  // Multi-account pass-throughs (for the UI layer)
  // ============================================

  /** List every signed-in account. */
  async listAccounts(): Promise<AuthSession[]> {
    return this.storage.listAccounts();
  }

  /** Id of the currently active account (undefined when signed out). */
  async getActiveAccountId(): Promise<string | undefined> {
    return this.storage.getActiveAccountId();
  }

  /**
   * Switch the active account and notify listeners. Returns false (no change)
   * when the id is unknown.
   */
  async switchAccount(userId: string): Promise<boolean> {
    const switched = await this.storage.setActiveAccount(userId);
    if (switched) {
      this._onAuthStateChanged.fire(await this.storage.getAuthSession());
    }
    return switched;
  }

  /**
   * Remove a specific account. When it was the active one, the active pointer
   * moves to a remaining account (or none) and listeners are notified.
   */
  async removeAccount(
    userId: string
  ): Promise<{ removedActive: boolean; newActiveId?: string }> {
    const result = await this.storage.removeAccount(userId);
    if (result.removedActive) {
      this._onAuthStateChanged.fire(await this.storage.getAuthSession());
    }
    return result;
  }

  /**
   * Best-effort revoke of every signed-in account's WorkOS session. Called by
   * the "Sign Out of All Accounts" flow before clearing storage.
   */
  async revokeAllSessions(): Promise<void> {
    const accounts = await this.storage.listAccounts();
    for (const account of accounts) {
      // Each revoke authenticates with its OWN account's token (identity-scoped
      // mutation) — see revokeDeviceSession.
      await this.revokeDeviceSession(account);
    }
  }

  /** Sign out of every account at once. */
  async signOutAll(): Promise<void> {
    await this.revokeAllSessions();
    this.tokenManager.clearInflight();
    await this.storage.clearAllAccounts();
    this._onAuthStateChanged.fire(null);
  }

  /** Whether the user is currently authenticated. */
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }

  /** Get the current user if authenticated. */
  async getCurrentUser(): Promise<User | null> {
    const session = await this.getSession();
    return session?.user || null;
  }

  dispose(): void {
    this._onAuthStateChanged.dispose();
  }
}
