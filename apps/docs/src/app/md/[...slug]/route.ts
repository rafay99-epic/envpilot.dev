import { getDocBySlug, getAllDocs } from "@/lib/content";

// Disk-based content only changes at deploy time — render at build, serve from CDN.
export const dynamic = "force-static";

export function generateStaticParams() {
  return getAllDocs().map((doc) => ({ slug: doc.slug.split("/") }));
}

interface RouteParams {
  params: Promise<{ slug: string[] }>;
}

/**
 * /md/[...slug] — raw, interpolated MDX source for a single doc page.
 *
 * Lets LLMs (and the "copy markdown" action) fetch the plain-text
 * source of a doc instead of parsing rendered HTML.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const doc = getDocBySlug((await params).slug.join("/"));

  if (!doc) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(doc.content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
