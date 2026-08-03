import { getAllDocsFull } from "@/lib/content";
import { extractHeadings } from "@/lib/headings";

// Disk-based content only changes at deploy time — build once, serve from CDN.
export const dynamic = "force-static";

/**
 * /search-index.json — the whole corpus in one small file.
 *
 * Titles, descriptions and headings only: enough to find the right page,
 * small enough (tens of KB) that the search dialog can fetch it once on
 * first open and match client-side. No search service, no index server.
 */
export async function GET() {
  const entries = getAllDocsFull().map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    section: doc.section,
    description: doc.description,
    headings: extractHeadings(doc.content).map((h) => h.text),
  }));

  return Response.json(entries, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
