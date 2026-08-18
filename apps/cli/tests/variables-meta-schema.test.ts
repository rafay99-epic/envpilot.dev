import { describe, it, expect } from "vitest";
import { variablesMetaSchema } from "../src/types/index.js";

describe("variablesMetaSchema", () => {
  // pull.ts widens this type with `role` / `projectRole`, which the server
  // still sends but the schema does not declare. If unknown keys stop
  // surviving the parse, file protection silently loses its inputs.
  it("keeps unknown keys the server sends", () => {
    const parsed = variablesMetaSchema.parse({
      scopeRestricted: false,
      role: "admin",
      projectRole: "manager",
      somethingNewTheServerAdded: 42,
    });
    expect(parsed).toMatchObject({
      role: "admin",
      projectRole: "manager",
      somethingNewTheServerAdded: 42,
    });
  });

  it("parses an empty meta block, since every field is optional", () => {
    expect(variablesMetaSchema.parse({})).toEqual({});
  });

  it("accepts the truncation cap", () => {
    expect(variablesMetaSchema.parse({ truncatedAt: 500 }).truncatedAt).toBe(
      500
    );
  });

  it("still rejects a wrongly typed known field", () => {
    expect(() =>
      variablesMetaSchema.parse({ scopeRestricted: "yes" })
    ).toThrow();
  });
});
