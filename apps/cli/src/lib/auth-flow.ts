import open from "open";
import chalk from "chalk";
import { hostname } from "node:os";
import { createSpinner, success, info } from "./ui.js";
import { upsertAccount, setActiveAccount } from "./config.js";
import { requestDeviceCode, pollForToken } from "./workos.js";
import { getJwtSessionId } from "./jwt.js";
import { recordDeviceSession } from "./api.js";
import type { Account } from "../types/index.js";

const MAX_CONSECUTIVE_ERRORS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the WorkOS device-authorization login flow.
 *
 * Requests a device + user code, shows it, opens the verification URL, then
 * polls WorkOS until the user approves in the browser. On success the AuthKit
 * tokens are stored on a new (or refreshed) account, the WorkOS session id is
 * decoded from the access token, and a device-session record is written so the
 * session appears in the active-sessions UI.
 *
 * Returns the authenticated user's email.
 */
export async function performLogin(options?: {
  browser?: boolean;
}): Promise<{ email: string }> {
  const deviceName = `CLI - ${hostname()}`;

  info("Starting authentication flow...");

  const spinner = createSpinner("Requesting device code...");
  spinner.start();

  let device;
  try {
    device = await requestDeviceCode();
  } catch (error) {
    spinner.stop();
    throw error;
  }

  spinner.stop();

  console.log();
  console.log(chalk.bold("Your authentication code:"));
  console.log();
  console.log(chalk.cyan.bold(`    ${device.user_code}`));
  console.log();
  console.log("Open this URL to authenticate:");
  console.log(chalk.dim(device.verification_uri_complete));
  console.log();

  if (options?.browser !== false) {
    info("Opening browser...");
    try {
      await open(device.verification_uri_complete);
    } catch {
      // Non-fatal — the user can open the URL manually.
    }
  }

  const pollSpinner = createSpinner("Waiting for authentication...");
  pollSpinner.start();

  // WorkOS dictates the poll cadence (interval, may increase on slow_down) and
  // the overall window (expires_in).
  let intervalMs = device.interval * 1000;
  const deadline = Date.now() + device.expires_in * 1000;
  let consecutiveErrors = 0;

  try {
    while (Date.now() < deadline) {
      await sleep(intervalMs);

      const result = await pollForToken(device.device_code);

      if (result.status === "complete") {
        pollSpinner.stop();

        const token = result.token;
        const email = token.user?.email ?? "";
        const userId =
          token.user?.id ?? `session-${token.access_token.slice(0, 8)}`;
        const name =
          [token.user?.first_name, token.user?.last_name]
            .filter(Boolean)
            .join(" ") || undefined;
        const sessionId = getJwtSessionId(token.access_token) ?? undefined;

        // Build an account keyed by user id and make it active — ADDS the
        // account without clobbering other logged-in accounts.
        const account: Account = {
          id: userId,
          user: {
            id: userId,
            email: email || `${userId}@cli.local`,
            name,
          },
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          sessionId,
          deviceName,
        };
        upsertAccount(account);
        setActiveAccount(account.id);

        // Record the session so it shows up in the active-sessions UI and can
        // be remotely revoked. Best-effort — never blocks a successful login.
        if (sessionId) {
          await recordDeviceSession(deviceName, sessionId);
        }

        console.log();
        success(`Logged in as ${chalk.bold(email || userId)}`);
        return { email };
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
            throw new Error(
              "Too many consecutive network errors while polling. Please check your connection and try again."
            );
          }
          break;
        case "denied":
          throw new Error("Authentication was denied. Please try again.");
        case "expired":
          throw new Error(
            "Authentication code expired. Please run `envpilot login` again."
          );
      }
    }

    throw new Error("Authentication timed out. Please try again.");
  } finally {
    // Always stop the spinner so its timer is cleared, however the loop exits.
    pollSpinner.stop();
  }
}
