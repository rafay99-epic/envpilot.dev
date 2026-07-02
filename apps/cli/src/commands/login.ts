import { Command } from "commander";
import { info, success } from "../lib/ui.js";
import { handleError } from "../lib/errors.js";
import { setApiUrl, listAccounts, getActiveAccount } from "../lib/config.js";
import { performLogin } from "../lib/auth-flow.js";

export const loginCommand = new Command("login")
  .description("Authenticate with Envpilot")
  .option("--api-url <url>", "API URL (default: https://www.envpilot.dev)")
  .option("--no-browser", "Do not automatically open the browser")
  .action(async (options) => {
    try {
      // Set API URL if provided
      if (options.apiUrl) {
        setApiUrl(options.apiUrl);
      }

      await performLogin({
        browser: options.browser !== false,
      });

      const activeAccount = getActiveAccount();
      if (activeAccount) {
        success(`Signed in as ${activeAccount.user.email}.`);
      }

      const accounts = listAccounts();
      if (accounts.length > 1) {
        info(
          `You have ${accounts.length} accounts — use \`envpilot accounts\` to list/switch.`
        );
      }

      console.log();
      console.log("Next steps:");
      info("  envpilot init     Initialize a project in the current directory");
      info("  envpilot list     List your projects and organizations");
      info("  envpilot sync     Login, select project, and pull — all at once");
      console.log();
    } catch (err) {
      await handleError(err);
    }
  });
