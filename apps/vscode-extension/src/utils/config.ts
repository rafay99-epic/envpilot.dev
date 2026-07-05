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

/**
 * Public WorkOS AuthKit client id and the Convex deployment URL, baked in at
 * build time via esbuild --define (see scripts/build.mjs). Sourced from the
 * same env vars the web app uses. The `typeof` guard makes referencing them
 * safe when the extension is run un-bundled (e.g. tests) — they fall back to
 * `process.env` / empty.
 */
declare const __WORKOS_CLIENT_ID__: string;
declare const __CONVEX_URL__: string;

const BUILD_WORKOS_CLIENT_ID: string =
  typeof __WORKOS_CLIENT_ID__ !== "undefined" && __WORKOS_CLIENT_ID__
    ? __WORKOS_CLIENT_ID__
    : (process.env.WORKOS_CLIENT_ID ?? "");

const BUILD_CONVEX_URL: string =
  typeof __CONVEX_URL__ !== "undefined" && __CONVEX_URL__
    ? __CONVEX_URL__
    : (process.env.NEXT_PUBLIC_CONVEX_URL ?? "");

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    serverUrl:
      config.get<string>("serverUrl", DEFAULT_SERVER_URL) || DEFAULT_SERVER_URL,
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
 * Prefers the VS Code setting, then the build-time baked URL. Callers still
 * fall back to `/api/extension/config` auto-detection when this is empty.
 */
export function getConvexUrl(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>("convexUrl", "") || BUILD_CONVEX_URL;
}

/**
 * Public WorkOS AuthKit client id used for the device authorization flow and
 * token refresh. Baked in at build time; safe to embed (same value the browser
 * app exposes).
 */
export function getWorkosClientId(): string {
  return BUILD_WORKOS_CLIENT_ID;
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
