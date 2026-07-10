/**
 * Feature Requests — Seed Data
 */

type SeedStatus =
  | "planned"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "completed"
  | "declined";

interface SeedFeatureRequest {
  title: string;
  description: string;
  category: string;
  status: SeedStatus;
  adminNotes?: string;
}

export const SEED_FEATURE_REQUESTS: SeedFeatureRequest[] = [
  // ── Planned ──
  {
    title: "GitHub & GitLab CI/CD integration",
    description:
      "Native GitHub Actions and GitLab CI integration that injects environment variables into CI/CD pipelines directly from Envpilot, eliminating the need to duplicate secrets across platforms.",
    category: "Integrations",
    status: "planned",
    adminNotes:
      "GitHub Action package designed at packages/github-action/. Research complete, design finalized. High priority after stable release.",
  },
  {
    title: "VS Code extension on Marketplace",
    description:
      "Publish the @envpilot/vscode-extension to the VS Code Marketplace so users can install it directly from the Extensions panel instead of sideloading the VSIX.",
    category: "Extension",
    status: "planned",
    adminNotes:
      "Extension is feature-complete. Need marketplace publisher account and CI pipeline for automated publishing.",
  },
  {
    title: "Secret rotation & expiry alerts",
    description:
      "Set expiry dates on environment variables and receive email/dashboard alerts before they expire. Optional auto-rotation support for supported secret types (API keys, tokens).",
    category: "Security",
    status: "planned",
    adminNotes:
      "Requires new fields on environmentVariables schema (expiresAt, rotationPolicy). Cron job for expiry checking.",
  },
  {
    title: "Docker & docker-compose secret injection",
    description:
      "CLI command to inject Envpilot variables into Docker containers and docker-compose services at runtime without writing .env files to disk.",
    category: "Integrations",
    status: "planned",
    adminNotes:
      "CLI subcommand: envpilot run -- docker-compose up. Similar to doppler run pattern.",
  },
  {
    title: "Environment comparison & diff view",
    description:
      "Side-by-side comparison view showing differences between environments (dev vs staging vs production) for the same project, highlighting missing, changed, and identical variables.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "UI mockup needed. Should work with encrypted values — compare vault hashes, not plaintext.",
  },
  {
    title: "Team activity feed & Slack notifications",
    description:
      "Real-time activity feed showing who changed what, when. Slack webhook integration for critical events like production variable changes, permission revocations, and new member joins.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "Activity feed from auditLogs table. Slack integration via incoming webhooks — admin configurable per org.",
  },
  {
    title: "Variable tagging & search",
    description:
      "Tag environment variables with custom labels (e.g. 'api-keys', 'database', 'third-party') and search/filter by tags across all projects in an organization.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "New tags array field on environmentVariables. Tag management UI in project settings.",
  },
  {
    title: "CLI binary auto-updater",
    description:
      "Automatic update checking and self-update mechanism for the CLI, notifying users when a new version is available and allowing one-command upgrades.",
    category: "CLI",
    status: "planned",
    adminNotes:
      "Version check endpoint already exists. Need platform-specific binary download + replace logic.",
  },
  {
    title: "Terraform / OpenTofu provider",
    description:
      "Official Terraform provider for Envpilot that allows managing environment variables and project configuration as infrastructure-as-code.",
    category: "Integrations",
    status: "planned",
    adminNotes: "Long-term. Requires stable public API first.",
  },
  {
    title: "Variable comments & change notes",
    description:
      "Add comments and change notes when updating environment variables, creating a discussion thread per variable that gives context on why values were changed.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "New comments table linked to environmentVariables. Show in version history timeline.",
  },
  {
    title: "Mobile app for emergency access",
    description:
      "Lightweight mobile app (iOS/Android) for emergency read-only access to environment variables when away from your workstation. Biometric authentication required.",
    category: "Platform",
    status: "planned",
    adminNotes:
      "React Native or Expo. Read-only initially. Biometric + PIN required. Very long term.",
  },
  {
    title: "Audit log export (CSV / JSON)",
    description:
      "Export audit logs to CSV or JSON format for compliance reporting, external analysis, or archival purposes. Support date range and filter-based exports.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "API endpoint for streaming export. Frontend download button on audit logs page.",
  },
  {
    title: "SSO / SAML support",
    description:
      "Enterprise SSO via SAML 2.0 for organizations that require centralized identity management. Enforce SSO-only login per organization.",
    category: "Security",
    status: "planned",
    adminNotes:
      "WorkOS already supports SAML/SSO. Need to enable it in AuthKit config and add org-level SSO enforcement toggle.",
  },
  {
    title: "JetBrains IDE plugin",
    description:
      "Plugin for IntelliJ IDEA, WebStorm, PyCharm, and other JetBrains IDEs with the same capabilities as the VS Code extension — pull/push, sync, tree views, and .env integration.",
    category: "Extension",
    status: "planned",
    adminNotes:
      "Kotlin/Java plugin. Reuse the REST API layer from the VS Code extension backend. Lower priority than VS Code.",
  },
  // ── In Progress ──
  {
    title: "Webhook events system",
    description:
      "Configurable webhook endpoints per organization that fire on events like variable changes, permission updates, and deployment triggers. Includes retry logic and delivery logs.",
    category: "Integrations",
    status: "in_progress",
    adminNotes:
      "Schema designed. Working on webhook delivery queue with Convex scheduled functions.",
  },
  {
    title: "Project-level .env file templates",
    description:
      "Define .env file templates per project that auto-generate properly formatted .env files with comments, grouping, and placeholder values for new team members.",
    category: "Dashboard",
    status: "in_progress",
    adminNotes:
      "environmentTemplates table exists. Building template editor UI and CLI pull --template flag.",
  },
  // ── Under Review ──
  {
    title: "GraphQL API",
    description:
      "Optional GraphQL API endpoint alongside the REST API for clients that prefer GraphQL queries and subscriptions for real-time variable updates.",
    category: "Platform",
    status: "under_review",
    adminNotes:
      "Evaluating if this adds enough value given Convex already provides real-time. May be overkill.",
  },
  {
    title: "Multi-region vault replication",
    description:
      "Replicate encrypted secrets across multiple geographic regions for lower latency access and disaster recovery. EU and US regions initially.",
    category: "Security",
    status: "under_review",
    adminNotes:
      "Depends on WorkOS Vault roadmap. Need to evaluate if we self-host vault or wait for their multi-region support.",
  },
];
