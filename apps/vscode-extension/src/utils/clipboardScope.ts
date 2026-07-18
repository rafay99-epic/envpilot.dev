import type { ProtectionMode } from "../services/fileProtection";

/**
 * Value of the "envpilot.clipboardGuard.scope" setting.
 * Pure module (no vscode import) so the decision matrix is unit-testable.
 */
export type ClipboardGuardScope = "all-managed" | "readonly-roles" | "off";

/**
 * Decide whether copy/cut should be blocked for a file.
 * `mode` is undefined when the file is not in the guard's managed map —
 * never blocked, regardless of scope.
 */
export function shouldBlock(
  scope: ClipboardGuardScope,
  mode: ProtectionMode | undefined
): boolean {
  if (mode === undefined || scope === "off") {
    return false;
  }
  if (scope === "all-managed") {
    return true;
  }
  // "readonly-roles": block only non-writable roles
  return mode === "strict-readonly" || mode === "readonly-with-request";
}
