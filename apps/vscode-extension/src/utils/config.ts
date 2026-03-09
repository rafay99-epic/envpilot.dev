import * as vscode from "vscode";
import type { ExtensionConfig } from "../types";

const CONFIG_SECTION = "envConnect";

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    serverUrl: config.get<string>("serverUrl", "http://localhost:3000"),
    autoSync: config.get<boolean>("autoSync", true),
    syncInterval: config.get<number>("syncInterval", 300),
    targetFile: config.get<string>("targetFile", ".env.local"),
    environment: config.get<string>("environment", "development"),
    preventCopyOnRevoke: config.get<boolean>("preventCopyOnRevoke", true),
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
 * Get the real-time sync interval in milliseconds
 * Default is 5 seconds for near-real-time revocation detection
 */
export function getRealTimeSyncInterval(): number {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  // Default to 5 seconds, min 2 seconds, max 30 seconds
  const seconds = config.get<number>("realTimeSyncInterval", 5);
  return Math.max(2, Math.min(30, seconds)) * 1000;
}

/**
 * Check if real-time sync is enabled
 * Default is true for immediate revocation detection
 */
export function isRealTimeSyncEnabled(): boolean {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<boolean>("enableRealTimeSync", true);
}

export async function updateConfig<K extends keyof ExtensionConfig>(
  key: K,
  value: ExtensionConfig[K],
): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update(key, value, vscode.ConfigurationTarget.Global);
}
