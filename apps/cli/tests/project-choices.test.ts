import { describe, it, expect } from "vitest";
import { projectChoices } from "../src/lib/ui.js";

// chalk may or may not emit colour depending on TTY detection, so compare on
// the stripped string rather than pinning escape codes.
const ESC = String.fromCharCode(27);
const plain = (s: string) =>
  s
    .split(ESC)
    .join("")
    .replace(/\[[0-9;]*m/g, "");

describe("projectChoices", () => {
  it("shows the name alone, never the icon identifier", () => {
    const rows = projectChoices([
      { _id: "1", name: "hello", slug: "hello" },
      { _id: "2", name: "hello-2", slug: "hello-2" },
    ]);
    expect(rows.map((r) => plain(r.name))).toEqual(["hello", "hello-2"]);
  });

  it("keeps the id as the selected value", () => {
    const rows = projectChoices([{ _id: "abc", name: "hello", slug: "hello" }]);
    expect(rows[0].value).toBe("abc");
  });

  it("disambiguates duplicate names with the slug", () => {
    // Only slug is unique per org, so two projects can genuinely share a name.
    // Without this the picker shows two identical, unpickable rows.
    const rows = projectChoices([
      { _id: "1", name: "api", slug: "api-eu" },
      { _id: "2", name: "api", slug: "api-us" },
      { _id: "3", name: "web", slug: "web" },
    ]);
    const names = rows.map((r) => plain(r.name));
    expect(names[0]).toBe("api api-eu");
    expect(names[1]).toBe("api api-us");
    expect(names[2]).toBe("web");
  });

  it("falls back so a row is never blank", () => {
    expect(
      plain(projectChoices([{ _id: "1", name: "", slug: "s" }])[0].name)
    ).toBe("s");
    expect(plain(projectChoices([{ _id: "only-id", name: "" }])[0].name)).toBe(
      "only-id"
    );
  });
});
