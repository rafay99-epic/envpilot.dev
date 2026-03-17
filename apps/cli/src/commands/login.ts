import { Command } from "commander";
import { info } from "../lib/ui.js";
import { handleError } from "../lib/errors.js";
import { setApiUrl } from "../lib/config.js";
import { performLogin } from "../lib/auth-flow.js";

export const loginCommand = new Command("login")
  .description("Authenticate with Envpilot")
  .option("--api-url <url>", "API URL (default: http://localhost:3000)")
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
