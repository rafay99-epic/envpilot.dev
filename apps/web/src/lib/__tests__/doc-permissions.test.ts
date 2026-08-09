// Who may edit, publish, and trash a documentation page.
//
// These predicates decide whether an unreviewed, often agent-written page
// reaches the team and every docs-scoped agent. They are pure functions with
// no ctx, so a wrong branch fails silently in production and only here.
import { describe, expect, it } from "vitest";

import {
  canDeleteDoc,
  canEditDoc,
  canPublishDoc,
  canSeeDoc,
  type DocAccess,
} from "@convex/features/docs/helpers";
import type { Doc, Id } from "@convex/_generated/dataModel";

const AUTHOR = "author" as Id<"users">;
const OTHER = "other" as Id<"users">;

const access = (over: Partial<DocAccess>): DocAccess =>
  ({
    project: {} as Doc<"projects">,
    canCreate: false,
    canEditAny: false,
    canPublish: false,
    canDelete: false,
    ...over,
  }) as DocAccess;

const doc = (over: Partial<Doc<"docs">> = {}): Doc<"docs"> =>
  ({
    authorId: AUTHOR,
    status: "draft",
    deletedAt: undefined,
    ...over,
  }) as Doc<"docs">;

// The seeded shapes these map to: developer = create only, editor = create +
// update + publish, team lead = all four, viewer = none.
const DEVELOPER = access({ canCreate: true });
const EDITOR = access({ canCreate: true, canEditAny: true, canPublish: true });
const TEAM_LEAD = access({
  canCreate: true,
  canEditAny: true,
  canPublish: true,
  canDelete: true,
});
const VIEWER = access({});

describe("canEditDoc", () => {
  it("lets an author revise their own page", () => {
    expect(canEditDoc(doc(), AUTHOR, DEVELOPER)).toBe(true);
  });

  it("needs the update capability for someone else's page", () => {
    expect(canEditDoc(doc(), OTHER, DEVELOPER)).toBe(false);
    expect(canEditDoc(doc(), OTHER, EDITOR)).toBe(true);
  });

  it("refuses a role that cannot even create", () => {
    expect(canEditDoc(doc(), AUTHOR, VIEWER)).toBe(false);
  });
});

describe("canPublishDoc", () => {
  it("is the publish capability alone — authorship grants nothing", () => {
    expect(canPublishDoc(DEVELOPER)).toBe(false);
    expect(canPublishDoc(EDITOR)).toBe(true);
  });
});

describe("canDeleteDoc", () => {
  it("lets an author trash their own draft", () => {
    expect(canDeleteDoc(doc(), AUTHOR, DEVELOPER)).toBe(true);
  });

  it("requires the delete capability once the page is published", () => {
    // The whole point of the publish gate: a published page belongs to the
    // team, so its author cannot unilaterally remove it from everyone.
    const published = doc({ status: "published" });
    expect(canDeleteDoc(published, AUTHOR, DEVELOPER)).toBe(false);
    expect(canDeleteDoc(published, AUTHOR, EDITOR)).toBe(false);
    expect(canDeleteDoc(published, AUTHOR, TEAM_LEAD)).toBe(true);
  });

  it("requires the delete capability for someone else's draft", () => {
    expect(canDeleteDoc(doc(), OTHER, EDITOR)).toBe(false);
    expect(canDeleteDoc(doc(), OTHER, TEAM_LEAD)).toBe(true);
  });
});

describe("canSeeDoc", () => {
  it("hides a draft from everyone but its author and the reviewers", () => {
    expect(canSeeDoc(doc(), OTHER, DEVELOPER)).toBe(false);
    expect(canSeeDoc(doc(), AUTHOR, DEVELOPER)).toBe(true);
    expect(canSeeDoc(doc(), OTHER, EDITOR)).toBe(true);
  });

  it("shows a published page to any project member", () => {
    expect(canSeeDoc(doc({ status: "published" }), OTHER, VIEWER)).toBe(true);
  });

  it("never shows a trashed page", () => {
    expect(
      canSeeDoc(doc({ status: "published", deletedAt: 1 }), AUTHOR, TEAM_LEAD)
    ).toBe(false);
  });
});
