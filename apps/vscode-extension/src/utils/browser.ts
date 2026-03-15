import * as vscode from "vscode";
import * as output from "./outputChannel";

/**
 * Open a URL in the default browser with clipboard fallback.
 * Always copies the URL to clipboard first as a safety net
 * (before openExternal can show error dialogs).
 * Returns true if the browser appeared to open, false otherwise.
 */
export async function openUrlReliably(url: string): Promise<boolean> {
  // Always copy to clipboard first — safety net
  await vscode.env.clipboard.writeText(url);

  // Log to output channel (URLs are clickable there)
  output.log(`Open this URL in your browser: ${url}`);

  // Try VS Code's built-in browser opener
  try {
    return await vscode.env.openExternal(vscode.Uri.parse(url));
  } catch {
    return false;
  }
}
