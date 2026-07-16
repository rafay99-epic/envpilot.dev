import { getAllDocs, getDocBySlug } from "@/lib/content";
import { SITE_URLS } from "@envpilot/ui";

// Disk-based content only changes at deploy time — render at build, serve from CDN.
export const dynamic = "force-static";

/**
 * /llms-full.txt — complete documentation dump for LLM consumption.
 *
 * Concatenates all MDX doc pages (with frontmatter variables resolved)
 * into a single plain-text file. Strips MDX-specific syntax and
 * outputs clean Markdown that any LLM can process.
 *
 * Follows the llms-full.txt convention from https://llmstxt.org/.
 */
export async function GET() {
  const docs = getAllDocs();

  const sections = docs
    .map((meta) => {
      const doc = getDocBySlug(meta.slug);
      if (!doc) return null;

      // Strip import statements and JSX components from MDX
      const cleaned = doc.content
        .replace(/^import\s+.*$/gm, "")
        .replace(/<[A-Z][^>]*\/>/g, "")
        .replace(/<[A-Z][^>]*>[\s\S]*?<\/[A-Z][^>]*>/g, "")
        .trim();

      return `${"=".repeat(72)}
${doc.title.toUpperCase()}
${"=".repeat(72)}
Source: ${SITE_URLS.docs}/${doc.slug}

${cleaned}`;
    })
    .filter(Boolean)
    .join("\n\n\n");

  const text = `# Envpilot — Complete Documentation
# Generated from source at ${new Date().toISOString()}
# ${SITE_URLS.docs}/llms-full.txt

Envpilot is a secure environment variable management platform for teams.
Secrets are encrypted at rest using AES-256 via WorkOS Vault. Access is
controlled through role-based permissions. Three client surfaces: CLI,
VS Code extension, and web dashboard.

Website: ${SITE_URLS.www}
npm: https://www.npmjs.com/package/@envpilot/cli
VS Code: https://marketplace.visualstudio.com/items?itemName=envpilot.envpilot
GitHub: https://github.com/rafay99-epic/envpilot.dev


${sections}
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
