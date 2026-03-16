import * as vscode from "vscode";
import { getServerUrl } from "../utils/config";
import * as output from "../utils/outputChannel";

const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const STATE_KEY = "envpilot.lastVersionCheck";

export class VersionCheckService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async checkForUpdate(): Promise<void> {
    try {
      // Throttle: check at most once per day
      const lastCheck = this.context.globalState.get<number>(STATE_KEY);
      if (lastCheck && Date.now() - lastCheck < CHECK_INTERVAL) return;

      const serverUrl = getServerUrl();
      const axios = (await import("axios")).default;
      const response = await axios.get(`${serverUrl}/api/version`, {
        timeout: 5000,
      });

      await this.context.globalState.update(STATE_KEY, Date.now());

      const latestVersion = response.data?.extension;
      if (!latestVersion) return;

      const currentVersion =
        this.context.extension.packageJSON.version as string;

      if (latestVersion !== currentVersion) {
        const action = await vscode.window.showInformationMessage(
          `Envpilot v${latestVersion} is available (you have v${currentVersion}).`,
          "Update"
        );

        if (action === "Update") {
          vscode.env.openExternal(
            vscode.Uri.parse(
              "vscode:extension/envpilot.envpilot"
            )
          );
        }
      }
    } catch (err) {
      output.warn(
        `Version check failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
