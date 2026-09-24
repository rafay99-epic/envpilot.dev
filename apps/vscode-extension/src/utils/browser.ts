import * as vscode from "vscode";
import * as output from "./outputChannel";

export async function openUrlReliably(url: string): Promise<boolean> {
  const opened = await vscode.env
    .openExternal(vscode.Uri.parse(url))
    .then(undefined, () => false);
  if (opened) {
    return true;
  }

  await vscode.env.clipboard.writeText(url);
  output.log(`Open this URL in your browser: ${url}`);
  return false;
}
