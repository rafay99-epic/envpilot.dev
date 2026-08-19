import { cacheLife } from "next/cache";
import { getAllPosts } from "@/lib/content";
import { SITE_URLS } from "@envpilot/ui";

/**
 * /llms.txt — compact machine-readable overview of the Envpilot Blog.
 *
 * Follows the llms.txt specification (https://llmstxt.org/).
 * Provides a structured summary and a list of every post that LLMs
 * can use to understand and navigate the blog's content.
 */
async function renderLlmsTxt() {
  "use cache";
  cacheLife("max");

  const posts = getAllPosts();

  const postLinks = posts
    .map(
      (post) =>
        `- [${post.title}](${SITE_URLS.blog}/${post.slug}): ${post.description} (${post.date}, ${post.tags.join(", ")})`
    )
    .join("\n");

  const text = `# Envpilot Blog

> Engineering, security, and building-in-public from the Envpilot team.

## Key Links

- Website: ${SITE_URLS.www}
- Docs: ${SITE_URLS.docs}
- Blog: ${SITE_URLS.blog}

## Posts

${postLinks}
`;

  return text;
}

export async function GET() {
  const text = await renderLlmsTxt();

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
