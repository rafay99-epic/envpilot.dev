import open from "open";
import chalk from "chalk";
import { hostname } from "node:os";
import { createAPIClient } from "./api.js";
import { createSpinner, success, info } from "./ui.js";
import {
  setAccessToken,
  setRefreshToken,
  setUser,
} from "./config.js";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // 5 minutes

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

  const initResponse = await api.post<{
    code: string;
    url: string;
    expiresAt: number;
  }>("/api/cli/auth?action=initiate", { deviceName });

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

  for (let attempts = 0; attempts < MAX_POLL_ATTEMPTS; attempts++) {
    await sleep(POLL_INTERVAL_MS);

    const pollResponse = await api.get<{
      status: "pending" | "authenticated" | "expired" | "not_found";
      accessToken?: string;
      refreshToken?: string;
      user?: {
        id: string;
        email: string;
        name?: string;
      };
    }>("/api/cli/auth", { action: "poll", code: initResponse.code });

    if (pollResponse.status === "authenticated") {
      pollSpinner.stop();

      if (pollResponse.accessToken) {
        setAccessToken(pollResponse.accessToken);
      }
      if (pollResponse.refreshToken) {
        setRefreshToken(pollResponse.refreshToken);
      }
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
      pollSpinner.stop();
      throw new Error("Authentication code expired. Please try again.");
    }
  }

  pollSpinner.stop();
  throw new Error("Authentication timed out. Please try again.");
}
