import * as vscode from "vscode";
import type { ExtensionConfig } from "../types";

const CONFIG_SECTION = "envpilot";

/**
 * Default server URL injected at build time via esbuild --define.
 * Falls back to localhost for local development if not defined.
 */
declare const __DEFAULT_SERVER_URL__: string;
const DEFAULT_SERVER_URL =
  typeof __DEFAULT_SERVER_URL__ !== "undefined"
    ? __DEFAULT_SERVER_URL__
    : "http://localhost:3000";

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    serverUrl: config.get<string>("serverUrl", DEFAULT_SERVER_URL),
    autoSync: config.get<boolean>("autoSync", true),
    syncInterval: config.get<number>("syncInterval", 300),
    targetFile: config.get<string>("targetFile", ".env.local"),
    environment: config.get<string>("environment", "development"),
    preventCopyOnRevoke: config.get<boolean>("preventCopyOnRevoke", true),
    commitGuardEnabled: config.get<boolean>("commitGuard.enabled", true),
    commitGuardAutoInstallHook: config.get<boolean>(
      "commitGuard.autoInstallHook",
      true
    ),
  };
}

export function getServerUrl(): string {
  return getConfig().serverUrl;
}

export function getTargetFile(): string {
  return getConfig().targetFile;
}

export function getEnvironment(): string {
  return getConfig().environment;
}

export function getSyncInterval(): number {
  return getConfig().syncInterval * 1000; // Convert to milliseconds
}

export function shouldAutoSync(): boolean {
  return getConfig().autoSync;
}

export function shouldPreventCopyOnRevoke(): boolean {
  return getConfig().preventCopyOnRevoke;
}

/**
 * Get the Convex deployment URL.
 * Checks setting first, then falls back to auto-detection from server.
 */
export function getConvexUrl(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>("convexUrl", "");
}

export function isCommitGuardEnabled(): boolean {
  return getConfig().commitGuardEnabled;
}

export function shouldAutoInstallHook(): boolean {
  return getConfig().commitGuardAutoInstallHook;
}

export async function updateConfig<K extends keyof ExtensionConfig>(
  key: K,
  value: ExtensionConfig[K]
): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update(key, value, vscode.ConfigurationTarget.Global);
}
