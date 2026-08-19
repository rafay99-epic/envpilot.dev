import { cacheLife } from "next/cache";
import { getDocBySlug, getAllDocs } from "@/lib/content";

async function readDoc(slug: string) {
  "use cache";
  cacheLife("max");

  return getDocBySlug(slug)?.content ?? null;
}

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
  const content = await readDoc((await params).slug.join("/"));

  if (content === null) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
