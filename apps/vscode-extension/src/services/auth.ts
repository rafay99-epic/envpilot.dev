import * as vscode from "vscode";
import * as crypto from "crypto";
import axios, { AxiosError } from "axios";
import { getServerUrl } from "../utils/config";
import { StorageService } from "../utils/storage";
import type { AuthSession, User, ApiResponse } from "../types";

const AUTH_CALLBACK_PATH = "/api/extension/auth/callback";
const AUTH_CHECK_PATH = "/api/extension/auth/check";

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
  }

  /**
   * Start the sign-in flow
   * Opens the browser to authenticate and registers a URI handler for callback
   */
  async signIn(): Promise<boolean> {
    const serverUrl = getServerUrl();

    // Create a unique session token for this auth attempt
    const sessionToken = generateSessionToken();

    // Store pending session
    await this.context.globalState.update("pendingAuthSession", sessionToken);

    // Build the auth URL
    const authUrl = `${serverUrl}/extension/auth?session=${sessionToken}`;

    // Open in browser
    await vscode.env.openExternal(vscode.Uri.parse(authUrl));

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

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "ENV Connect: Waiting for sign-in...",
        cancellable: true,
      },
      async (progress, cancellationToken) => {
        const startTime = Date.now();
        let attempts = 0;

        progress.report({ message: "Complete sign-in in your browser" });

        while (!cancellationToken.isCancellationRequested) {
          // Check timeout
          if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
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

          try {
            const response = await axios.get<ApiResponse<AuthSession>>(
              `${serverUrl}${AUTH_CHECK_PATH}`,
              {
                params: { session: sessionToken },
                timeout: 10000,
              }
            );

            if (response.data.data) {
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
          } catch {
            // Ignore poll errors and keep trying
          }
        }

        // Cancelled by user
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
    vscode.window.showInformationMessage("Signed out of ENV Connect");
  }

  /**
   * Get the current auth session if valid
   */
  async getSession(): Promise<AuthSession | null> {
    return this.storage.getAuthSession();
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
    } catch {
      // If refresh fails, sign out
      await this.signOut();
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
    this._onAuthStateChanged.dispose();
  }
}

function generateSessionToken(): string {
  // Use crypto module for cryptographically secure random tokens
  return crypto.randomBytes(32).toString("hex");
}
