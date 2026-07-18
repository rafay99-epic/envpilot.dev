import * as vscode from "vscode";
import { getServerUrl } from "../utils/config";
import * as output from "../utils/outputChannel";

const FETCH_INTERVAL = 60 * 60 * 1000; // refetch the manifest at most hourly
const NOTICE_INTERVAL = 24 * 60 * 60 * 1000; // soft "update available" once/day

const FETCH_KEY = "envpilot.lastVersionCheck";
const NOTICE_KEY = "envpilot.lastVersionNotice";
const LATEST_KEY = "envpilot.latestVersion";
const MIN_KEY = "envpilot.minVersion";

const MARKETPLACE_URI = "vscode:extension/envpilot.envpilot";

/**
 * Module-level latch so the (async) update check can gate synchronous command
 * execution in {@link wrapCommand}. Set true once we positively learn the
 * running extension is below the server's minimum supported version.
 */
let _outdated = false;
export function isExtensionOutdated(): boolean {
  return _outdated;
}

/**
 * Compare two dotted numeric versions (`x.y.z`). <0 if a<b, 0 equal, >0 if a>b.
 * Missing/non-numeric segments count as 0; pre-release suffixes are ignored.
 */
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

/**
 * Two-tier version enforcement for the extension:
 *  - below the server `minExtension` → hard block: set the {@link isExtensionOutdated}
 *    latch + `envpilot.outdated` context, and show a modal prompting an update.
 *    {@link wrapCommand} then refuses every command until the user updates.
 *  - behind `extension` (latest) but supported → soft, once/day info notice.
 *
 * Fail-open: any fetch failure leaves the last known latest/min in globalState,
 * so a learned hard block still applies offline, but a first-ever offline run
 * never blocks.
 */
export class VersionCheckService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async checkForUpdate(): Promise<void> {
    // Latch a cached hard block BEFORE the fetch — the network round trip can
    // take seconds (or hang), and wrapCommand must not run commands on a
    // known-outdated build in the meantime. Prompts wait for the post-fetch
    // evaluation so the user is never shown two dialogs per check.
    await this.evaluate(false);

    // Best-effort manifest refresh, isolated from enforcement. A fetch failure
    // (offline, server down) must NOT skip the cached min/latest evaluation
    // below — otherwise the hard block silently disappears the moment the
    // network blips after the fetch interval lapses. Enforce from last-known
    // cached state regardless (fail-open only on no-cache + network error).
    try {
      await this.refreshManifest();
    } catch (err) {
      output.warn(
        `Version manifest refresh failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    await this.evaluate(true);
  }

  /** Evaluate cached min/latest against the running version; set the latch. */
  private async evaluate(prompt: boolean): Promise<void> {
    try {
      const current = this.context.extension.packageJSON.version as string;
      const latest = this.context.globalState.get<string>(LATEST_KEY);
      const min = this.context.globalState.get<string>(MIN_KEY);

      // Hard block: below the minimum supported version.
      if (min && compareVersions(current, min) < 0) {
        _outdated = true;
        void vscode.commands.executeCommand(
          "setContext",
          "envpilot.outdated",
          true
        );
        if (prompt) {
          await this.promptUpdate(
            `Envpilot v${min} or newer is required — your version (v${current}) no longer works with the server. Update to continue.`,
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

      // Soft notice: supported but behind latest. Throttled to once per day.
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

  /** Fetch the manifest (throttled hourly) and persist latest/min. */
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
