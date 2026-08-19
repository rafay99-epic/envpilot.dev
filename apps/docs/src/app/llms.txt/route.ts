import { cacheLife } from "next/cache";
import { getAllDocs } from "@/lib/content";
import { SITE_URLS } from "@envpilot/ui";

/**
 * /llms.txt — compact machine-readable overview of Envpilot.
 *
 * Follows the llms.txt specification (https://llmstxt.org/).
 * Provides a structured summary that LLMs can use to understand
 * what Envpilot is, what it does, and where to find detailed docs.
 */
// Disk content only changes at deploy time. `use cache` can't sit on the GET
// export, so the body lives here and the handler just serves it.
async function renderLlmsTxt() {
  "use cache";
  cacheLife("max");

  const docs = getAllDocs();

  // Grouped by section so the list reads as the site's structure, not a
  // flat dump — the sections are already in reading order.
  const docLinks = docs
    .reduce<{ section: string; lines: string[] }[]>((groups, doc) => {
      const line = `- [${doc.title}](${SITE_URLS.docs}/${doc.slug}): ${doc.description}`;
      const last = groups[groups.length - 1];
      if (last && last.section === doc.section) last.lines.push(line);
      else groups.push({ section: doc.section, lines: [line] });
      return groups;
    }, [])
    .map((group) => `### ${group.section}\n\n${group.lines.join("\n")}`)
    .join("\n\n");

  const text = `# Envpilot

> Secure environment variable management for teams.

Envpilot is a platform for managing, sharing, and syncing environment variables across development teams. Secrets are encrypted at rest using AES-256 via WorkOS Vault with per-organization key isolation. Access is controlled through two-tier role-based permissions (organization roles + project roles) with optional per-variable grants.

The platform has five client surfaces:
- **CLI** (\`@envpilot/cli\`) — pull, push, run, and manage secret files from the terminal
- **VS Code Extension** — real-time sync inside VS Code and Cursor
- **Web Dashboard** — full management UI at envpilot.dev
- **REST API + GitHub Action** — read-only machine access with org-scoped API keys
- **MCP Server** — scoped, audited secret access for coding agents

## Key Links

- Website: ${SITE_URLS.www}
- Documentation: ${SITE_URLS.docs}
- npm: https://www.npmjs.com/package/@envpilot/cli
- VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=envpilot.envpilot
- GitHub: https://github.com/rafay99-epic/envpilot.dev
- Full LLM context: ${SITE_URLS.docs}/llms-full.txt

## Documentation

${docLinks}

## Quick Start

\`\`\`bash
npm install -g @envpilot/cli
envpilot sync
\`\`\`

## Environments

Three environments per project: development, staging, production.

## Roles

One capability-backed role per member: Owner, Project Manager, Team Lead, Editor, Developer, Viewer.
Project assignments decide where the role applies, with optional environment scope.

Owners, project managers, team leads and editors write directly. Developers write only what they hold a grant for and file requests for the rest. Viewers read only.

## Security

- AES-256 encryption via WorkOS Vault
- Zero-knowledge architecture (server never holds plaintext secrets)
- Per-variable access control with optional expiration
- Comprehensive audit trail (40+ action types)
- Instant revocation across CLI, extension, and dashboard
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
