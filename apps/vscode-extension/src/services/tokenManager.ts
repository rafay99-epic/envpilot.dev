import * as vscode from "vscode";
import { StorageService } from "../utils/storage";
import type { AuthSession } from "../types";
import { SingleFlight } from "../utils/singleFlight";
import { isTokenExpiring, getJwtSessionId } from "../utils/jwt";
import { refreshAccessToken, WorkosAuthError } from "./workos";
import * as output from "../utils/outputChannel";

export class TransientAuthError extends Error {
  override name = "TransientAuthError";
}

export class TokenManager {
  private storage: StorageService;
  private refresh = new SingleFlight();
  private sessionDead = new vscode.EventEmitter<string>();
  readonly onSessionDead = this.sessionDead.event;

  constructor(storage: StorageService) {
    this.storage = storage;
    this.getFreshToken = this.getFreshToken.bind(this);
  }

  async getFreshToken(
    force?: boolean | { forceRefreshToken: boolean }
  ): Promise<string | null> {
    const session = await this.storage.getAuthSession();
    if (!session) {
      return null;
    }
    const forceRefresh =
      typeof force === "object" ? force.forceRefreshToken : force === true;
    return this.freshTokenFor(session, forceRefresh);
  }

  getFreshTokenForAccount(session: AuthSession): Promise<string | null> {
    return this.freshTokenFor(session, false);
  }

  clearInflight(): void {
    this.refresh.clear();
  }

  clearInflightFor(userId: string): void {
    this.refresh.delete(`refresh:${userId}`);
  }

  private async freshTokenFor(
    session: AuthSession,
    force: boolean
  ): Promise<string | null> {
    if (!force && !isTokenExpiring(session.accessToken)) {
      return session.accessToken;
    }
    const userId = session.user.id;
    return this.refresh.run(`refresh:${userId}`, async () => {
      let account = await this.readAccount(userId);
      let mustRotate = force;
      const rejected = new Set<string>();
      while (account?.refreshToken && !rejected.has(account.refreshToken)) {
        if (!mustRotate && !isTokenExpiring(account.accessToken)) {
          return account.accessToken;
        }
        try {
          return await this.rotate(account);
        } catch (err) {
          if (
            !(err instanceof WorkosAuthError && err.code === "access_denied")
          ) {
            throw new TransientAuthError(
              err instanceof Error ? err.message : String(err)
            );
          }
        }
        rejected.add(account.refreshToken);
        mustRotate = false;
        account = await this.readAccount(userId);
      }
      if (account && rejected.has(account.refreshToken)) {
        output.warn("Session refresh rejected, signing out.");
        await this.storage.removeAccount(userId, { promote: false });
        this.sessionDead.fire(userId);
      }
      return null;
    });
  }

  private async rotate(account: AuthSession): Promise<string | null> {
    const result = await refreshAccessToken(account.refreshToken);
    const current = await this.readAccount(account.user.id);
    if (current?.refreshToken !== account.refreshToken) {
      return current?.accessToken ?? null;
    }
    await this.storage.updateAccountTokens(account.user.id, {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      sessionId: getJwtSessionId(result.access_token) ?? account.sessionId,
    });
    return result.access_token;
  }

  private async readAccount(userId: string): Promise<AuthSession | undefined> {
    return (await this.storage.listAccounts()).find(
      (a) => a.user.id === userId
    );
  }
}
