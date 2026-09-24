import * as vscode from "vscode";
import { getServerUrl } from "../utils/config";
import * as output from "../utils/outputChannel";

const FETCH_INTERVAL = 60 * 60 * 1000;
const NOTICE_INTERVAL = 24 * 60 * 60 * 1000;

const FETCH_KEY = "envpilot.lastVersionCheck";
const NOTICE_KEY = "envpilot.lastVersionNotice";
const LATEST_KEY = "envpilot.latestVersion";
const MIN_KEY = "envpilot.minVersion";

export const MARKETPLACE_URI = "vscode:extension/envpilot.envpilot";

let _outdated = false;
export function isExtensionOutdated(): boolean {
  return _outdated;
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export class VersionCheckService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async checkForUpdate(): Promise<void> {
    await this.evaluate(false);

    try {
      await this.refreshManifest();
    } catch (err) {
      output.warn(
        `Version manifest refresh failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    await this.evaluate(true);
  }

  private async evaluate(prompt: boolean): Promise<void> {
    try {
      const current = this.context.extension.packageJSON.version as string;
      const latest = this.context.globalState.get<string>(LATEST_KEY);
      const min = this.context.globalState.get<string>(MIN_KEY);

      if (min && compareVersions(current, min) < 0) {
        _outdated = true;
        void vscode.commands.executeCommand(
          "setContext",
          "envpilot.outdated",
          true
        );
        if (prompt) {
          await this.promptUpdate(
            `Envpilot v${min} or newer is required, but your version (v${current}) no longer works with the server. Update to continue.`,
            true
          );
        }
        return;
      }

      _outdated = false;
      void vscode.commands.executeCommand(
        "setContext",
        "envpilot.outdated",
        false
      );
      if (!prompt) return;

      if (latest && compareVersions(current, latest) < 0) {
        const lastNotice =
          this.context.globalState.get<number>(NOTICE_KEY) ?? 0;
        if (Date.now() - lastNotice < NOTICE_INTERVAL) return;
        await this.context.globalState.update(NOTICE_KEY, Date.now());
        await this.promptUpdate(
          `Envpilot v${latest} is available (you have v${current}).`,
          false
        );
      }
    } catch (err) {
      output.warn(
        `Version check failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async refreshManifest(): Promise<void> {
    const lastFetch = this.context.globalState.get<number>(FETCH_KEY) ?? 0;
    const haveCached =
      this.context.globalState.get<string>(MIN_KEY) != null ||
      this.context.globalState.get<string>(LATEST_KEY) != null;
    if (haveCached && Date.now() - lastFetch < FETCH_INTERVAL) return;

    const serverUrl = getServerUrl();
    const axios = (await import("axios")).default;
    const response = await axios.get(`${serverUrl}/api/version`, {
      timeout: 5000,
    });

    await this.context.globalState.update(FETCH_KEY, Date.now());
    const latest = response.data?.extension;
    const min = response.data?.minExtension;
    if (typeof latest === "string") {
      await this.context.globalState.update(LATEST_KEY, latest);
    }
    if (typeof min === "string") {
      await this.context.globalState.update(MIN_KEY, min);
    }
  }

  private async promptUpdate(message: string, modal: boolean): Promise<void> {
    const action = modal
      ? await vscode.window.showErrorMessage(message, { modal }, "Update")
      : await vscode.window.showInformationMessage(message, "Update");
    if (action === "Update") {
      void vscode.env.openExternal(vscode.Uri.parse(MARKETPLACE_URI));
    }
  }
}
