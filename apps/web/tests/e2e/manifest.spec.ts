import { expect, test } from "@playwright/test";

// Unauthenticated e2e — the web app manifest behind "Add to Home Screen".
// Browsers fetch it without cookies, so a WorkOS redirect here would break
// installation silently. It must be public JSON and point at the inbox.

test.describe("GET /manifest.webmanifest", () => {
  test("is public JSON that installs to the requests inbox", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("manifest");

    const manifest = (await res.json()) as {
      start_url: string;
      display: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    expect(manifest.start_url).toBe("/dashboard/requests");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"])
    );

    for (const icon of manifest.icons) {
      const iconRes = await request.get(icon.src, { maxRedirects: 0 });
      expect(iconRes.status(), `${icon.src} should be public`).toBe(200);
    }
  });
});
