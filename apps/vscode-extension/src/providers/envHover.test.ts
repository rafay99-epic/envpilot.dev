import { describe, it, expect, vi } from "vitest";

const showInformationMessage = vi.hoisted(() => vi.fn());
vi.mock("vscode", () => ({
  window: { showInformationMessage, showWarningMessage: vi.fn() },
}));

import { revealHoverValue } from "./envHover";
import type { ApiService } from "../services/api";
import type { StorageService } from "../utils/storage";

function setup(reveal: boolean, linked = "p1") {
  const getVariables = vi.fn(async () => [
    { key: "A", value: "secret-a" },
    { key: "B", value: "secret-b" },
  ]);
  const api = {
    getAccessMeta: () => ({
      capabilities: { "project.secrets.reveal": reveal },
    }),
    getVariables,
  } as unknown as ApiService;
  const storage = {
    getLinkedProjectsMetadataV2: () => [{ projectId: linked }],
  } as unknown as StorageService;
  return { api, storage, getVariables };
}

describe("revealHoverValue", () => {
  const args = { key: "A", projectId: "p1", environment: "development" };

  it("refuses without the reveal capability or a linked project", async () => {
    for (const { api, storage, getVariables } of [
      setup(false),
      setup(true, "other"),
    ]) {
      await revealHoverValue(api, storage, args);
      expect(getVariables).not.toHaveBeenCalled();
    }
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it("shows only the requested key in a modal", async () => {
    const { api, storage } = setup(true);
    await revealHoverValue(api, storage, args);
    expect(showInformationMessage).toHaveBeenCalledWith("A = secret-a", {
      modal: true,
    });
  });
});
