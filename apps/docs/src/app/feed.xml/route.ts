import { cacheLife } from "next/cache";
import { getAllDocs } from "@/lib/content";
import { SITE_URLS } from "@envpilot/ui";

/**
 * RSS 2.0 feed for Envpilot documentation pages.
 *
 * Serves at /feed.xml — auto-discovered by RSS readers via the
 * <link rel="alternate" type="application/rss+xml"> tag in the layout.
 */
// Disk content plus a build-stamped `lastBuildDate`. Both belong in a cache
// scope: `use cache` can't sit on the GET export, so the body lives here.
async function renderFeed() {
  "use cache";
  cacheLife("max");

  const docs = getAllDocs();
  const now = new Date().toUTCString();

  const items = docs
    .map(
      (doc) => `    <item>
      <title>${escapeXml(doc.title)}</title>
      <link>${SITE_URLS.docs}/${doc.slug}</link>
      <guid isPermaLink="true">${SITE_URLS.docs}/${doc.slug}</guid>
      <description>${escapeXml(doc.description)}</description>
      <pubDate>${now}</pubDate>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Envpilot Documentation</title>
    <link>${SITE_URLS.docs}</link>
    <description>Secure environment variable management for teams. CLI, VS Code extension, and web dashboard documentation.</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${SITE_URLS.docs}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return xml;
}

export async function GET() {
  const xml = await renderFeed();

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
