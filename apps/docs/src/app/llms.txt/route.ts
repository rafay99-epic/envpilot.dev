import { getAllDocs } from "@/lib/content";
import { SITE_URLS } from "@envpilot/ui";

/**
 * /llms.txt — compact machine-readable overview of Envpilot.
 *
 * Follows the llms.txt specification (https://llmstxt.org/).
 * Provides a structured summary that LLMs can use to understand
 * what Envpilot is, what it does, and where to find detailed docs.
 */
export async function GET() {
  const docs = getAllDocs();

  const docLinks = docs
    .map(
      (doc) =>
        `- [${doc.title}](${SITE_URLS.docs}/${doc.slug}): ${doc.description}`
    )
    .join("\n");

  const text = `# Envpilot

> Secure environment variable management for teams.

Envpilot is a platform for managing, sharing, and syncing environment variables across development teams. Secrets are encrypted at rest using AES-256 via WorkOS Vault with per-organization key isolation. Access is controlled through two-tier role-based permissions (organization roles + project roles) with optional per-variable grants.

The platform has three client surfaces:
- **CLI** (\`@envpilot/cli\`) — pull, push, and manage variables from the terminal
- **VS Code Extension** — real-time sync inside VS Code and Cursor
- **Web Dashboard** — full management UI at envpilot.dev

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

Organization: Admin, Team Lead, Member
Project: Manager, Developer, Viewer

Admins and Team Leads push directly. Developers create approval requests. Viewers have read-only access to permitted variables.

## Security

- AES-256 encryption via WorkOS Vault
- Zero-knowledge architecture (server never holds plaintext secrets)
- Per-variable access control with optional expiration
- Comprehensive audit trail (40+ action types)
- Instant revocation across CLI, extension, and dashboard
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
