import * as vscode from "vscode";
import { execFile } from "child_process";

/**
 * Open a URL in the default browser.
 *
 * Tries the OS's native command first (child_process), then falls back to
 * vscode.env.openExternal. We prefer child_process because openExternal
 * is broken on certain OS versions (e.g., macOS Tahoe) where it shows
 * "No application found to open URL" even when a default browser is set.
 */
export function openUrl(url: string): void {
  const platform = process.platform;

  if (platform === "darwin") {
    execFile("open", [url], handleError);
  } else if (platform === "linux") {
    execFile("xdg-open", [url], handleError);
  } else if (platform === "win32") {
    execFile("cmd", ["/c", "start", "", url], handleError);
  } else {
    // Unknown platform — fall back to VS Code API
    vscode.env.openExternal(vscode.Uri.parse(url));
  }
}

function handleError(error: Error | null): void {
  if (error) {
    // Native command failed — fall back to VS Code API
    vscode.env.openExternal(vscode.Uri.parse("https://www.envpilot.dev"));
  }
}
