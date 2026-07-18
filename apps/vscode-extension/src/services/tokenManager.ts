// WorkOS access-token freshness manager.
//
// WorkOS access tokens live ~5 minutes. Every Convex WebSocket auth fetch,
// every one-shot Convex call, and every surviving vault HTTP request first goes
// through getFreshToken(), which decodes the active account's stored token
// `exp` and, when it is expired or within 60s of expiring, refreshes it
// (rotating the refresh token) and persists the result back onto the active
// account in SecretStorage.
//
// Concurrent callers share a single in-flight refresh (single-flight, keyed by
// account id) instead of each hitting WorkOS and racing to persist rotated
// tokens.

import { StorageService } from "../utils/storage";
import type { AuthSession } from "../types";
import { SingleFlight } from "../utils/singleFlight";
import { isTokenExpiring, getJwtSessionId } from "../utils/jwt";
import { refreshAccessToken, WorkosAuthError } from "./workos";
import * as output from "../utils/outputChannel";
import { captureError } from "../utils/sentry";

export class TokenManager {
  private storage: StorageService;
  private refresh = new SingleFlight();

  constructor(storage: StorageService) {
    this.storage = storage;
    // Bind so it can be passed directly as ConvexClient.setAuth's fetcher.
    this.getFreshToken = this.getFreshToken.bind(this);
  }

  /**
   * Return a valid WorkOS access token for the active account, refreshing it
   * first when it is expired or about to expire (<60s left). Returns null when
   * there is no session (signed out) or when a refresh definitively fails.
   *
   * `force` skips the expiry shortcut and always refreshes (still single-
   * flight) — used when the SERVER rejected a token that looks fresh locally.
   * Accepts Convex's AuthTokenFetcher arg shape so this method can be passed
   * directly to `client.setAuth`.
   *
   * On a rejected refresh grant (`access_denied` — token revoked/expired) the
   * active account's credentials are cleared so the UI drops to signed-out. A
   * transient refresh failure (network/5xx/429) keeps the credentials and
   * returns null so the caller retries later.
   */
  async getFreshToken(
    force?: boolean | { forceRefreshToken: boolean }
  ): Promise<string | null> {
    const session = await this.storage.getAuthSession();
    if (!session) {
      return null;
    }
    const forceRefresh =
      typeof force === "object" ? force.forceRefreshToken : (force ?? false);
    return this.freshTokenFor(session, forceRefresh);
  }

  /**
   * Like getFreshToken but for a SPECIFIC account, not just the active one.
   * Used by "sign out of all accounts", which must revoke each account's WorkOS
   * session under THAT account's own identity — the active account's token
   * can't authenticate a revoke for a different user.
   */
  async getFreshTokenForAccount(session: AuthSession): Promise<string | null> {
    return this.freshTokenFor(session);
  }

  /**
   * Abandon any in-flight refreshes. Called from sign-out-all before clearing
   * storage so a refresh that is mid-flight can't hand a stale token to a new
   * caller after the account is gone. (updateAccountTokens already refuses to
   * resurrect a removed account, so this is belt-and-braces.)
   */
  clearInflight(): void {
    this.refresh.clear();
  }

  /** Abandon ONE account's in-flight refresh (single-account sign-out). */
  clearInflightFor(userId: string): void {
    this.refresh.delete(`refresh:${userId}`);
  }

  private async freshTokenFor(
    session: AuthSession,
    force = false
  ): Promise<string | null> {
    if (!session.accessToken) {
      return null;
    }
    if (!force && !isTokenExpiring(session.accessToken)) {
      return session.accessToken;
    }
    if (!session.refreshToken) {
      return null;
    }

    return this.refresh.run(`refresh:${session.user.id}`, async () => {
      try {
        const result = await refreshAccessToken(session.refreshToken);
        // Patch THIS account's tokens in place — never changes the active
        // account and never resurrects an account removed mid-refresh.
        await this.storage.updateAccountTokens(session.user.id, {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          sessionId: getJwtSessionId(result.access_token) ?? session.sessionId,
        });
        return result.access_token;
      } catch (err) {
        if (err instanceof WorkosAuthError && err.code === "access_denied") {
          // Refresh token revoked/expired — the session is genuinely dead.
          // (The .finally in SingleFlight.run removes this key; other
          // accounts' in-flight refreshes are unaffected.)
          output.warn("Session refresh rejected — signing out.");
          await this.storage.removeAccount(session.user.id);
          return null;
        }
        // Transient (network / 5xx / 429) — keep creds, let the caller retry.
        captureError(err, { phase: "token-refresh" });
        return null;
      }
    });
  }
}
