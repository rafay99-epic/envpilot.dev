import * as vscode from "vscode";

let channel: vscode.OutputChannel | null = null;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Envpilot");
  }
  return channel;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function log(message: string): void {
  getChannel().appendLine(`[${timestamp()}] ${message}`);
}

export function warn(message: string): void {
  getChannel().appendLine(`[${timestamp()}] WARN: ${message}`);
}

export function error(message: string): void {
  getChannel().appendLine(`[${timestamp()}] ERROR: ${message}`);
}

export function show(): void {
  getChannel().show(true);
}

export function dispose(): void {
  channel?.dispose();
  channel = null;
}
