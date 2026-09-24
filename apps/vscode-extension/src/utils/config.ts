import * as vscode from "vscode";
import type { ConflictStrategy, ExtensionConfig } from "../types";

const CONFIG_SECTION = "envpilot";

declare const __DEFAULT_SERVER_URL__: string;
const DEFAULT_SERVER_URL =
  typeof __DEFAULT_SERVER_URL__ !== "undefined"
    ? __DEFAULT_SERVER_URL__
    : "http://localhost:3000";

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
    targetFile: config.get<string>("targetFile", ".env.local"),
    environment: config.get<string>("environment", "development"),
    preventCopyOnRevoke: config.get<boolean>("preventCopyOnRevoke", true),
    commitGuardEnabled: config.get<boolean>("commitGuard.enabled", true),
    commitGuardAutoInstallHook: config.get<boolean>(
      "commitGuard.autoInstallHook",
      true
    ),
    idlePauseMinutes: config.get<number>("idlePauseMinutes", 10),
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

export function shouldAutoSync(): boolean {
  return getConfig().autoSync;
}

export function shouldPreventCopyOnRevoke(): boolean {
  return getConfig().preventCopyOnRevoke;
}

export function getDefaultConflictResolution(): "prompt" | ConflictStrategy {
  const raw = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>("defaultConflictResolution", "prompt");
  const allowed: ReadonlyArray<"prompt" | ConflictStrategy> = [
    "prompt",
    "overwrite",
    "backup",
    "merge",
    "skip",
  ];
  return allowed.find((v) => v === raw) ?? "prompt";
}

export function getIdlePauseMinutes(): number {
  return getConfig().idlePauseMinutes;
}

export function getConvexUrl(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>("convexUrl", "") || BUILD_CONVEX_URL;
}

export function getWorkosClientId(): string {
  return BUILD_WORKOS_CLIENT_ID;
}

export function isCommitGuardEnabled(): boolean {
  return getConfig().commitGuardEnabled;
}

export function shouldAutoInstallHook(): boolean {
  return getConfig().commitGuardAutoInstallHook;
}
