import { describe, expect, it } from "vitest";

import { validateHttpUrl } from "@convex/lib/urlValidation";

/**
 * The `websiteUrl` scheme rule.
 *
 * This used to live in a zod schema on POST /api/accounts, tested by importing
 * that route and mocking six Next.js modules to get past its top-level
 * imports. The route is gone (the browser calls Convex directly), so the rule
 * moved to convex/lib/urlValidation and this test imports it plainly.
 *
 * Why it matters: `websiteUrl` is rendered as an href in the account list.
 * A `javascript:` URL there is stored XSS, and after the route was deleted
 * this validator is the ONLY server-side check standing between a caller and
 * that href.
 */
describe("validateHttpUrl", () => {
  it("accepts a valid https URL", () => {
    expect(validateHttpUrl("https://dashboard.stripe.com")).toBeNull();
  });

  it("accepts a valid http URL", () => {
    expect(validateHttpUrl("http://internal.example.com/login")).toBeNull();
  });

  it("accepts undefined (the field is optional)", () => {
    expect(validateHttpUrl(undefined)).toBeNull();
  });

  it("accepts an empty string, which clears the field", () => {
    expect(validateHttpUrl("")).toBeNull();
  });

  it("rejects a javascript: URL", () => {
    // `new URL("javascript:alert(1)")` parses fine, so the scheme test has to
    // run before parsing rather than relying on it.
    expect(validateHttpUrl("javascript:alert(1)")).toEqual({
      kind: "bad-scheme",
    });
  });

  it("rejects a data: URL", () => {
    expect(validateHttpUrl("data:text/html,<script>alert(1)</script>")).toEqual(
      { kind: "bad-scheme" }
    );
  });

  it("rejects an ftp: URL", () => {
    expect(validateHttpUrl("ftp://files.example.com")).toEqual({
      kind: "bad-scheme",
    });
  });

  it("rejects a protocol-relative URL", () => {
    expect(validateHttpUrl("//evil.example.com/phish")).toEqual({
      kind: "bad-scheme",
    });
  });

  it("rejects a scheme-smuggling prefix", () => {
    expect(validateHttpUrl(" javascript:alert(1)")).toEqual({
      kind: "bad-scheme",
    });
  });

  it("rejects a URL over the length cap", () => {
    expect(validateHttpUrl(`https://e.com/${"a".repeat(2100)}`)).toEqual({
      kind: "too-long",
    });
  });

  it("rejects an http-prefixed string that is not a URL", () => {
    expect(validateHttpUrl("https://")).toEqual({ kind: "malformed" });
  });
});
