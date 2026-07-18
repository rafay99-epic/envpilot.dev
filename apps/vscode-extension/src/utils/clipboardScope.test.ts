import { describe, it, expect } from "vitest";
import { shouldBlock, type ClipboardGuardScope } from "./clipboardScope";
import type { ProtectionMode } from "../services/fileProtection";

describe("shouldBlock", () => {
  // Full matrix: scope × mode (undefined = file not in the managed map).
  const matrix: Array<
    [ClipboardGuardScope, ProtectionMode | undefined, boolean]
  > = [
    ["off", "strict-readonly", false],
    ["off", "readonly-with-request", false],
    ["off", "writable", false],
    ["off", undefined, false],

    ["readonly-roles", "strict-readonly", true],
    ["readonly-roles", "readonly-with-request", true],
    ["readonly-roles", "writable", false],
    ["readonly-roles", undefined, false],

    ["all-managed", "strict-readonly", true],
    ["all-managed", "readonly-with-request", true],
    ["all-managed", "writable", true],
    ["all-managed", undefined, false],
  ];

  for (const [scope, mode, expected] of matrix) {
    it(`${scope} + ${mode ?? "unmanaged"} -> ${expected ? "block" : "allow"}`, () => {
      expect(shouldBlock(scope, mode)).toBe(expected);
    });
  }
});
