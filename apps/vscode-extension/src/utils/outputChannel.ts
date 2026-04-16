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

/**
 * Structured log entry — writes the event + key/value fields on one line.
 * Example: logEvent("poll", { attempt: 3, status: 404, duration_ms: 212 })
 *   → [12:34:56.789] poll attempt=3 status=404 duration_ms=212
 *
 * Use this for auth flow observability instead of raw `log()` so field
 * names stay consistent and lines are greppable.
 */
export function logEvent(
  event: string,
  fields: Record<string, unknown> = {}
): void {
  const parts = Object.entries(fields).map(
    ([k, v]) => `${k}=${formatValue(v)}`
  );
  const line = parts.length ? `${event} ${parts.join(" ")}` : event;
  getChannel().appendLine(`[${timestamp()}] ${line}`);
}

export function warnEvent(
  event: string,
  fields: Record<string, unknown> = {}
): void {
  const parts = Object.entries(fields).map(
    ([k, v]) => `${k}=${formatValue(v)}`
  );
  const line = parts.length ? `${event} ${parts.join(" ")}` : event;
  getChannel().appendLine(`[${timestamp()}] WARN: ${line}`);
}

export function errorEvent(
  event: string,
  fields: Record<string, unknown> = {}
): void {
  const parts = Object.entries(fields).map(
    ([k, v]) => `${k}=${formatValue(v)}`
  );
  const line = parts.length ? `${event} ${parts.join(" ")}` : event;
  getChannel().appendLine(`[${timestamp()}] ERROR: ${line}`);
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") {
    return v.includes(" ") ? JSON.stringify(v) : v;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function show(): void {
  getChannel().show(true);
}

export function dispose(): void {
  channel?.dispose();
  channel = null;
}
