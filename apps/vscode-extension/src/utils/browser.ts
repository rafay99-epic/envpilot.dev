import * as vscode from "vscode";
import * as output from "./outputChannel";

/**
 * Open a URL in the default browser with clipboard fallback.
 * The URL is only copied to the clipboard (and logged) when the browser
 * fails to open — sign-in URLs carry the auth session token, so they must
 * not land in the clipboard on every successful sign-in, where clipboard
 * managers and other apps could capture them.
 * Returns true if the browser appeared to open, false otherwise.
 */
export async function openUrlReliably(url: string): Promise<boolean> {
  try {
    const opened = await vscode.env.openExternal(vscode.Uri.parse(url));
    if (opened) {
      return true;
    }
  } catch {
    // Fall through to the clipboard fallback
  }

  // Browser failed — copy to clipboard and log (URLs are clickable there)
  await vscode.env.clipboard.writeText(url);
  output.log(`Open this URL in your browser: ${url}`);
  return false;
}
