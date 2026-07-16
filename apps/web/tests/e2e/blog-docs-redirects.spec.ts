import { expect, test } from "@playwright/test";

// Unauthenticated e2e — /blog and /docs moved to standalone apps on
// blog.envpilot.dev / docs.envpilot.dev. The web app must permanently
// redirect every legacy path (deep links included) to the new host, and
// its sitemap must no longer advertise the moved pages. A regression here
// either 404s inbound links or resurrects the old duplicate content.

const BLOG_URL =
  process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.envpilot.dev";
const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.envpilot.dev";

/** [legacy web path, expected redirect destination] */
const REDIRECTS: [string, string][] = [
  ["/blog", BLOG_URL],
  ["/blog/some-post", `${BLOG_URL}/some-post`],
  ["/blog/some-post?tag=security", `${BLOG_URL}/some-post?tag=security`],
  ["/docs", DOCS_URL],
  ["/docs/getting-started", `${DOCS_URL}/getting-started`],
  ["/docs/cli", `${DOCS_URL}/cli`],
  ["/feed.xml", `${DOCS_URL}/feed.xml`],
  ["/llms.txt", `${DOCS_URL}/llms.txt`],
  ["/llms-full.txt", `${DOCS_URL}/llms-full.txt`],
];

test.describe("blog/docs subdomain redirects", () => {
  for (const [source, destination] of REDIRECTS) {
    test(`${source} → ${destination}`, async ({ request }) => {
      const response = await request.get(source, { maxRedirects: 0 });
      // next.config redirects() with permanent: true issues a 308.
      expect([301, 308]).toContain(response.status());
      expect(response.headers()["location"]).toBe(destination);
    });
  }

  test("sitemap.xml no longer lists /blog or /docs pages", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml).not.toContain("/blog");
    expect(xml).not.toContain("/docs");
  });
});
