import open from "open";
import chalk from "chalk";
import { hostname } from "node:os";
import { createAPIClient } from "./api.js";
import { createSpinner, success, info } from "./ui.js";
import { setAccessToken, setRefreshToken, setUser } from "./config.js";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // 5 minutes
const MAX_CONSECUTIVE_ERRORS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the device-code login flow.
 * Returns the authenticated user's email.
 */
export async function performLogin(options?: {
  browser?: boolean;
}): Promise<{ email: string }> {
  const api = createAPIClient();
  const deviceName = `CLI - ${hostname()}`;

  info("Starting authentication flow...");

  const spinner = createSpinner("Generating authentication code...");
  spinner.start();

  let initResponse: { code: string; url: string; expiresAt: number };
  try {
    initResponse = await api.initiateAuth(deviceName);
  } catch (error) {
    spinner.stop();
    throw error;
  }

  spinner.stop();

  console.log();
  console.log(chalk.bold("Your authentication code:"));
  console.log();
  console.log(chalk.cyan.bold(`    ${initResponse.code}`));
  console.log();
  console.log(`Open this URL to authenticate:`);
  console.log(chalk.dim(initResponse.url));
  console.log();

  if (options?.browser !== false) {
    info("Opening browser...");
    await open(initResponse.url);
  }

  const pollSpinner = createSpinner("Waiting for authentication...");
  pollSpinner.start();

  let consecutiveErrors = 0;

  try {
    for (let attempts = 0; attempts < MAX_POLL_ATTEMPTS; attempts++) {
      await sleep(POLL_INTERVAL_MS);

      let pollResponse: {
        status: "pending" | "authenticated" | "expired" | "not_found";
        accessToken?: string;
        refreshToken?: string;
        user?: { id: string; email: string; name?: string };
      };

      try {
        pollResponse = await api.pollAuth(initResponse.code);
        consecutiveErrors = 0;
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(
            "Too many consecutive network errors while polling. Please check your connection and try again."
          );
        }
        // Transient failure — retry on next iteration
        continue;
      }

      if (pollResponse.status === "authenticated") {
        pollSpinner.stop();

        // The server must return tokens when status is "authenticated".
        // Fail explicitly instead of silently proceeding without credentials —
        // a silent miss here leaves the user "logged in" with no stored token,
        // making every subsequent command fail with "Authentication required".
        if (!pollResponse.accessToken || !pollResponse.refreshToken) {
          throw new Error(
            "Authentication succeeded but the server did not return session tokens. " +
              "This is likely a server-side issue. Please try again or contact support."
          );
        }

        setAccessToken(pollResponse.accessToken);
        setRefreshToken(pollResponse.refreshToken);

        if (pollResponse.user) {
          setUser({
            id: pollResponse.user.id,
            email: pollResponse.user.email,
            name: pollResponse.user.name,
          });
        }

        console.log();
        success(`Logged in as ${chalk.bold(pollResponse.user?.email)}`);
        return { email: pollResponse.user?.email || "" };
      }

      if (
        pollResponse.status === "expired" ||
        pollResponse.status === "not_found"
      ) {
        throw new Error("Authentication code expired. Please try again.");
      }
    }

    throw new Error("Authentication timed out. Please try again.");
  } finally {
    // Always stop the spinner so its setInterval timer is cleared,
    // regardless of how the loop exits (success, error, timeout).
    pollSpinner.stop();
  }
}
