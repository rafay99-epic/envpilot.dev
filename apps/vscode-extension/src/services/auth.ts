import * as vscode from "vscode";
import * as crypto from "crypto";
import axios from "axios";
import { getServerUrl } from "../utils/config";
import { openUrlReliably } from "../utils/browser";
import * as output from "../utils/outputChannel";
import { captureError } from "../utils/sentry";
import { StorageService } from "../utils/storage";
import type { AuthSession, User, ApiResponse } from "../types";

const AUTH_CHECK_PATH = "/api/extension/auth/check";

/** Only log the first 8 chars of the session token — enough to correlate. */
function sessionPrefix(token: string): string {
  return token.slice(0, 8);
}

/**
 * The most recently constructed `AuthService` instance, if any.
 *
 * `ApiService` needs to trigger a token refresh / reauth prompt on a 401
 * response, but it is only ever given a `StorageService` (see api.ts) and
 * the extension wires services up purely via constructor injection in
 * extension.ts. Rather than changing that wiring (which would ripple into
 * extension.ts), `AuthService` publishes itself here so `api.ts` can reach
 * it without a constructor change. There is only ever one live
 * `AuthService` per extension host.
 */
let activeAuthService: AuthService | null = null;

/** Get the currently active `AuthService`, if the extension has activated one. */
export function getActiveAuthService(): AuthService | null {
  return activeAuthService;
}

/**
 * Authentication service for the extension
 * Uses OAuth flow through the browser for secure authentication
 */
export class AuthService {
  private storage: StorageService;
  private context: vscode.ExtensionContext;
  private _onAuthStateChanged = new vscode.EventEmitter<AuthSession | null>();
  readonly onAuthStateChanged = this._onAuthStateChanged.event;

  constructor(context: vscode.ExtensionContext, storage: StorageService) {
    this.context = context;
    this.storage = storage;
    // Intentional self-registration (see `getActiveAuthService` above), not
    // an accidental `this` alias.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeAuthService = this;
  }

  /**
   * Start the sign-in flow
   * Opens the browser to authenticate and registers a URI handler for callback
   */
  async signIn(): Promise<boolean> {
    const serverUrl = getServerUrl();

    // Create a unique session token for this auth attempt
    const sessionToken = generateSessionToken();
    const session = sessionPrefix(sessionToken);

    output.logEvent("signIn.start", { session, serverUrl });

    // Store pending session
    await this.context.globalState.update("pendingAuthSession", sessionToken);

    // Build the auth URL
    const authUrl = `${serverUrl}/extension/auth?session=${sessionToken}`;

    // Open in browser (also copies URL to clipboard as safety net)
    const browserOpened = await openUrlReliably(authUrl);

    if (browserOpened) {
      output.logEvent("signIn.browser_opened", { session });
    } else {
      output.warnEvent("signIn.browser_open_failed", { session });
      // Browser failed — tell user about clipboard and output channel
      const action = await vscode.window.showWarningMessage(
        "Could not open browser. The sign-in URL has been copied to your clipboard.",
        "Show Output Log"
      );
      if (action === "Show Output Log") {
        output.show();
      }
    }

    // Auto-poll for auth completion with progress indicator
    return this.pollForAuthCompletion(sessionToken);
  }

  /**
   * Poll the server for auth completion with a progress indicator.
   * Automatically detects when the user completes sign-in in the browser.
   */
  private async pollForAuthCompletion(sessionToken: string): Promise<boolean> {
    const serverUrl = getServerUrl();
    const POLL_INTERVAL_MS = 2000;
    const MAX_POLL_DURATION_MS = 120000; // 2 minutes timeout
    const session = sessionPrefix(sessionToken);

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Envpilot: Waiting for sign-in...",
        cancellable: true,
      },
      async (progress, cancellationToken) => {
        const startTime = Date.now();
        let attempts = 0;

        progress.report({ message: "Complete sign-in in your browser" });

        while (!cancellationToken.isCancellationRequested) {
          // Check timeout
          if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
            output.warnEvent("poll.timeout", {
              session,
              attempts,
              elapsed_ms: Date.now() - startTime,
            });
            await this.context.globalState.update(
              "pendingAuthSession",
              undefined
            );
            vscode.window.showWarningMessage(
              "Sign-in timed out. Please try again."
            );
            return false;
          }

          // Wait before polling (skip first attempt for faster response)
          if (attempts > 0) {
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, POLL_INTERVAL_MS);
              cancellationToken.onCancellationRequested(() => {
                clearTimeout(timer);
                resolve();
              });
            });
          }

          if (cancellationToken.isCancellationRequested) {
            break;
          }

          attempts++;
          progress.report({
            message: `Waiting for browser sign-in... (${Math.floor((Date.now() - startTime) / 1000)}s)`,
          });

          const reqStart = Date.now();
          try {
            const response = await axios.get<ApiResponse<AuthSession>>(
              `${serverUrl}${AUTH_CHECK_PATH}`,
              {
                params: { session: sessionToken },
                timeout: 10000,
              }
            );

            if (response.data.data) {
              output.logEvent("poll.success", {
                session,
                attempts,
                status: response.status,
                duration_ms: Date.now() - reqStart,
                elapsed_ms: Date.now() - startTime,
              });

              await this.storage.setAuthSession(response.data.data);
              this._onAuthStateChanged.fire(response.data.data);
              await this.context.globalState.update(
                "pendingAuthSession",
                undefined
              );

              vscode.window.showInformationMessage(
                `Signed in as ${response.data.data.user.email}`
              );
              return true;
            }

            // 200 with no data shouldn't happen, but log it so we see it.
            output.warnEvent("poll.empty_response", {
              session,
              attempts,
              status: response.status,
            });
          } catch (err: unknown) {
            const axErr = err as {
              response?: { status?: number };
              code?: string;
              message?: string;
            };
            const status = axErr?.response?.status;
            // 404 is the expected "not yet" response while the user is
            // still on the browser auth page — log it at debug granularity
            // so it doesn't drown the channel, but include it when status
            // is unexpected (429, 5xx, network errors).
            if (status === 404) {
              output.logEvent("poll.waiting", {
                session,
                attempts,
                duration_ms: Date.now() - reqStart,
              });
            } else {
              output.warnEvent("poll.error", {
                session,
                attempts,
                status: status ?? "network",
                code: axErr?.code ?? "-",
                message: axErr?.message ?? "unknown",
                duration_ms: Date.now() - reqStart,
              });
            }
          }
        }

        output.warnEvent("poll.cancelled", {
          session,
          attempts,
          elapsed_ms: Date.now() - startTime,
        });
        await this.context.globalState.update("pendingAuthSession", undefined);
        return false;
      }
    );
  }

  /**
   * Sign out and clear stored credentials
   */
  async signOut(): Promise<void> {
    await this.storage.clearAuthSession();
    this._onAuthStateChanged.fire(null);
    vscode.window.showInformationMessage("Signed out of Envpilot");
  }

  /**
   * Get the current auth session if valid
   */
  async getSession(): Promise<AuthSession | null> {
    return this.storage.getAuthSession();
  }

  // ============================================
  // Multi-account pass-throughs (for the UI layer)
  // ============================================
  //
  // signIn() already ADDS an account via storage.setAuthSession (upsert +
  // activate) and signOut() logs out only the ACTIVE account via
  // clearAuthSession — both unchanged externally. These wrappers expose the
  // rest of the account surface so the UI agent can drive it through
  // AuthService (and get onAuthStateChanged notifications on active switches).

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

  /** Sign out of every account at once. */
  async signOutAll(): Promise<void> {
    await this.storage.clearAllAccounts();
    this._onAuthStateChanged.fire(null);
  }

  /**
   * Check if the user is currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }

  /**
   * Get the current user if authenticated
   */
  async getCurrentUser(): Promise<User | null> {
    const session = await this.getSession();
    return session?.user || null;
  }

  /**
   * Refresh the access token if needed
   */
  async refreshToken(): Promise<boolean> {
    const session = await this.getSession();
    if (!session?.refreshToken) {
      return false;
    }

    const serverUrl = getServerUrl();

    try {
      const response = await axios.post<ApiResponse<AuthSession>>(
        `${serverUrl}/api/extension/auth/refresh`,
        { refreshToken: session.refreshToken },
        { timeout: 10000 }
      );

      if (response.data.data) {
        await this.storage.setAuthSession(response.data.data);
        this._onAuthStateChanged.fire(response.data.data);
        return true;
      }

      return false;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      captureError(err, { phase: "auth-refresh-token" });
      // Only sign out when the server definitively rejects the refresh
      // token (4xx). Transient network errors or server outages must not
      // destroy an otherwise valid session.
      if (status !== undefined && status >= 400 && status < 500) {
        await this.signOut();
      }
      return false;
    }
  }

  /**
   * Validate the current session with the server
   */
  async validateSession(): Promise<boolean> {
    const session = await this.getSession();
    if (!session) {
      return false;
    }

    const serverUrl = getServerUrl();

    try {
      const response = await axios.get<ApiResponse<{ valid: boolean }>>(
        `${serverUrl}/api/extension/auth/validate`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
          timeout: 10000,
        }
      );

      return response.data.data?.valid === true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (activeAuthService === this) {
      activeAuthService = null;
    }
    this._onAuthStateChanged.dispose();
  }
}

function generateSessionToken(): string {
  // Use crypto module for cryptographically secure random tokens
  return crypto.randomBytes(32).toString("hex");
}
