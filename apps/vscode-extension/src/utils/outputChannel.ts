import * as vscode from "vscode";

let channel: vscode.OutputChannel | null = null;

function getChannel(): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel("Envpilot");
  return channel;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") {
    return v.includes(" ") ? JSON.stringify(v) : v;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function write(
  prefix: string,
  event: string,
  fields: Record<string, unknown>
): void {
  const parts = Object.entries(fields).map(
    ([k, v]) => `${k}=${formatValue(v)}`
  );
  const time = new Date().toISOString().slice(11, 23);
  getChannel().appendLine(`[${time}] ${prefix}${[event, ...parts].join(" ")}`);
}

export function log(event: string, fields: Record<string, unknown> = {}): void {
  write("", event, fields);
}

export function warn(
  event: string,
  fields: Record<string, unknown> = {}
): void {
  write("WARN: ", event, fields);
}

export function error(
  event: string,
  fields: Record<string, unknown> = {}
): void {
  write("ERROR: ", event, fields);
}

export function show(): void {
  getChannel().show(true);
}

export function dispose(): void {
  channel?.dispose();
  channel = null;
}
