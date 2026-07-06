// Validates the `websiteUrl` rule inside `createAccountSchema`
// (apps/web/src/app/api/accounts/route.ts): it must be a well-formed URL
// AND start with http:// or https:// — this is the server-side XSS/scheme
// defense described in PLAN.md edge case #11 (websiteUrl XSS: scheme
// validated server-side). `createAccountSchema` was exported (no behavior
// change) specifically so this rule is testable in isolation.
//
// route.ts's *unused-by-the-schema* top-level imports (withAuth from
// @workos-inc/authkit-nextjs, NextResponse, the Convex client, vault
// helpers) pull in Next.js server internals that vitest's plain "node"
// environment cannot resolve (`next/cache` fails to resolve from inside
// authkit-nextjs's own dependency tree when loaded outside a Next.js build/
// runtime — this reproduces with a bare `import { createAccountSchema }`
// too, since ESM evaluates the whole module graph). None of these mocked
// modules are exercised by createAccountSchema itself (it only needs zod),
// so stubbing them out here is a test-harness workaround, not a product
// behavior change.
import { describe, expect, it, vi } from "vitest";

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));
vi.mock("next/server", () => ({
  NextResponse: { json: vi.fn() },
}));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@/lib/api-errors", () => ({
  sanitizeConvexError: vi.fn(),
  handleApiError: vi.fn(),
}));
vi.mock("@/lib/convex-helpers", () => ({
  getOrCreateConvexUser: vi.fn(),
  checkOrganizationMembership: vi.fn(),
  getProjectOrganization: vi.fn(),
}));
vi.mock("@/lib/convex-client", () => ({
  convex: {},
  createAuthedConvexClient: vi.fn(),
}));

const { createAccountSchema } = await import("@/app/api/accounts/route");

const baseBody = {
  organizationId: "org1",
  projectId: "proj1",
  name: "Test Account",
  username: "user@example.com",
  password: "hunter2",
  environments: ["development"],
};

function parseWithUrl(websiteUrl: string | undefined) {
  return createAccountSchema.safeParse({ ...baseBody, websiteUrl });
}

describe("createAccountSchema websiteUrl validation", () => {
  it("accepts a valid https URL", () => {
    const result = parseWithUrl("https://dashboard.stripe.com");
    expect(result.success).toBe(true);
  });

  it("accepts a valid http URL", () => {
    const result = parseWithUrl("http://internal.example.com/login");
    expect(result.success).toBe(true);
  });

  it("accepts an omitted websiteUrl (optional field)", () => {
    const result = createAccountSchema.safeParse(baseBody);
    expect(result.success).toBe(true);
  });

  it("rejects a javascript: URL", () => {
    const result = parseWithUrl("javascript:alert(1)");
    expect(result.success).toBe(false);
  });

  it("rejects a data: URL", () => {
    const result = parseWithUrl("data:text/html,<script>alert(1)</script>");
    expect(result.success).toBe(false);
  });

  it("rejects an ftp: URL", () => {
    const result = parseWithUrl("ftp://files.example.com");
    expect(result.success).toBe(false);
  });

  it("rejects a protocol-relative URL", () => {
    const result = parseWithUrl("//evil.example.com/phish");
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = parseWithUrl("");
    expect(result.success).toBe(false);
  });

  it("rejects a bare scheme-less string", () => {
    const result = parseWithUrl("dashboard.stripe.com");
    expect(result.success).toBe(false);
  });

  it("rejects mixed-case scheme tricks (still validated case-insensitively but must still be http/https)", () => {
    // HTTPS uppercase is legal per the /^https?:\/\//i regex — confirm it is accepted.
    expect(parseWithUrl("HTTPS://dashboard.stripe.com").success).toBe(true);
    // A javascript: scheme in any case must still be rejected.
    expect(parseWithUrl("JAVASCRIPT:alert(1)").success).toBe(false);
  });
});
