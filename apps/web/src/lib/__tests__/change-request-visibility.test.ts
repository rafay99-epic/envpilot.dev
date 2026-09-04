// Change-request visibility, tested against the backend source of truth in
// convex/features/changeRequests/visibility.ts (resolved via the @convex alias).
import { describe, expect, it } from "vitest";

import {
  canSeeRequest,
  collectVisibleInOrg,
  type ProjectRequestScope,
} from "@convex/features/changeRequests/visibility";
import type { Id } from "@convex/_generated/dataModel";

const projectId = (value: string) => value as Id<"projects">;

const row = (project: string, environments: string[]) => ({
  projectId: projectId(project),
  environments,
});

async function* stream<T>(rows: T[]): AsyncIterable<T> {
  for (const item of rows) yield item;
}

describe("canSeeRequest", () => {
  it("hides rows on a project the actor has no scope for", () => {
    expect(canSeeRequest(undefined, ["development"])).toBe(false);
  });

  it("treats assigned: false as the owner class, not as unassigned", () => {
    // What assertProjectAction returns for a role that bypasses assignment.
    const ownerScope: ProjectRequestScope = { assigned: false };
    expect(canSeeRequest(ownerScope, ["production"])).toBe(true);
  });

  it("honours the environment scope of an assignment", () => {
    const scoped: ProjectRequestScope = {
      assigned: true,
      environmentScope: ["development"],
    };
    expect(canSeeRequest(scoped, ["development"])).toBe(true);
    expect(canSeeRequest(scoped, ["production"])).toBe(false);
  });
});

describe("collectVisibleInOrg", () => {
  const scopes = new Map<string, ProjectRequestScope>([
    ["mine", { assigned: true }],
  ]);

  it("returns everything for an unrestricted actor, up to the limit", async () => {
    const rows = [row("a", ["production"]), row("b", ["staging"])];
    expect(await collectVisibleInOrg(stream(rows), null, 1)).toHaveLength(1);
  });

  it("keeps collecting past inaccessible rows instead of capping first", async () => {
    const rows = [
      ...Array.from({ length: 50 }, () => row("theirs", ["production"])),
      row("mine", ["production"]),
    ];
    const visible = await collectVisibleInOrg(stream(rows), scopes, 10);
    expect(visible).toEqual([row("mine", ["production"])]);
  });

  it("stops at the limit once enough visible rows are collected", async () => {
    const rows = Array.from({ length: 5 }, () => row("mine", ["staging"]));
    expect(await collectVisibleInOrg(stream(rows), scopes, 3)).toHaveLength(3);
  });
});
