import type { ProtectionMode } from "../roles";

export type ClipboardGuardScope = "all-managed" | "readonly-roles" | "off";

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
  return mode === "strict-readonly" || mode === "readonly-with-request";
}
