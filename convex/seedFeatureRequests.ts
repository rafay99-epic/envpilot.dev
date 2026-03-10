import { mutation } from "./_generated/server";

/**
 * Production seed: populate feature requests / roadmap.
 * Run once via Convex dashboard: api.seedFeatureRequests.seedFeatureRequests
 */
export const seedFeatureRequests = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if feature requests already have entries
    const existing = await ctx.db.query("featureRequests").take(1);
    if (existing.length > 0) {
      return { message: "Feature requests already seeded, skipping" };
    }

    const now = Date.now();

    const features = [
      // ─── PLANNED ───
      {
        title: "Secret rotation & expiry alerts",
        description:
          "Automatically rotate secrets on a configurable schedule and send email/Slack notifications before credentials expire. Supports database URLs, API keys, and OAuth tokens.",
        status: "planned" as const,
        category: "Security",
        voteCount: 42,
      },
      {
        title: "Environment comparison & diff view",
        description:
          "Side-by-side comparison of variables across environments (e.g., staging vs production). Highlight missing keys, value mismatches, and sensitive changes before deployment.",
        status: "planned" as const,
        category: "Dashboard",
        voteCount: 38,
      },
      {
        title: "GitHub & GitLab CI/CD integration",
        description:
          "Inject Envpilot-managed secrets directly into GitHub Actions and GitLab CI pipelines without committing .env files. One-click setup from the dashboard.",
        status: "planned" as const,
        category: "Integrations",
        voteCount: 55,
      },
      {
        title: "Team activity feed & Slack notifications",
        description:
          "Real-time activity feed on the dashboard showing variable changes, permission updates, and team events. Optional Slack webhook integration for instant notifications.",
        status: "planned" as const,
        category: "Dashboard",
        voteCount: 29,
      },
      {
        title: "Variable tagging & search",
        description:
          "Tag variables with custom labels (e.g., 'database', 'third-party', 'deprecated') and search/filter across projects by tag, key, or description.",
        status: "planned" as const,
        category: "Dashboard",
        voteCount: 24,
      },

      // ─── IN PROGRESS ───
      {
        title: "CLI binary auto-updater",
        description:
          "Self-update command for the CLI binary (`envpilot update`) that downloads the latest release for your platform. Includes version check on every run with opt-out flag.",
        status: "in_progress" as const,
        category: "CLI",
        voteCount: 31,
      },
      {
        title: "VS Code extension on Marketplace",
        description:
          "Publish the Envpilot VS Code extension to the official VS Code Marketplace and Open VSX Registry for one-click installation.",
        status: "in_progress" as const,
        category: "Extension",
        voteCount: 47,
      },
      {
        title: "Docker & docker-compose secret injection",
        description:
          "Inject Envpilot secrets into Docker containers and docker-compose services at runtime without baking them into images. Supports both build-time args and runtime env.",
        status: "in_progress" as const,
        category: "Integrations",
        voteCount: 36,
      },

      // ─── COMPLETED ───
      {
        title: "Project-level RBAC",
        description:
          "Restrict team members to specific projects with viewer, developer, and manager roles. Admins assign project access during invitation or later from the project settings page.",
        status: "completed" as const,
        category: "Security",
        voteCount: 61,
      },
      {
        title: "WebSocket real-time sync for extension",
        description:
          "Replace HTTP polling with persistent Convex WebSocket subscriptions in the VS Code extension. Reduces API costs from ~744 calls/hour/user to near-zero.",
        status: "completed" as const,
        category: "Extension",
        voteCount: 33,
      },
      {
        title: "Git safety checks in CLI",
        description:
          "CLI blocks push/pull if .env files are tracked by git and auto-suggests `git rm --cached` commands. Prevents accidental secret commits.",
        status: "completed" as const,
        category: "CLI",
        voteCount: 27,
      },

      // ─── SUBMITTED (community requests) ───
      {
        title: "Terraform / OpenTofu provider",
        description:
          "A Terraform provider that reads secrets from Envpilot and injects them into infrastructure-as-code definitions. Would support data sources and import workflows.",
        status: "submitted" as const,
        category: "Integrations",
        voteCount: 18,
      },
      {
        title: "SSO / SAML support",
        description:
          "Enterprise SSO via SAML 2.0 and OIDC for organizations that require centralized identity management. Auto-provision users and map groups to Envpilot roles.",
        status: "submitted" as const,
        category: "Security",
        voteCount: 22,
      },
      {
        title: "Mobile app for emergency access",
        description:
          "Lightweight mobile app (iOS & Android) for emergency read-only access to secrets when you're away from your laptop. Biometric auth required.",
        status: "submitted" as const,
        category: "Platform",
        voteCount: 14,
      },
      {
        title: "Vercel & Netlify integration",
        description:
          "Push Envpilot variables directly to Vercel or Netlify project settings. Two-way sync with conflict detection.",
        status: "submitted" as const,
        category: "Integrations",
        voteCount: 40,
      },
      {
        title: "Variable comments & change notes",
        description:
          "Add inline comments to individual variables explaining what they're for, and require change notes when updating sensitive values.",
        status: "submitted" as const,
        category: "Dashboard",
        voteCount: 16,
      },
      {
        title: "JetBrains IDE plugin",
        description:
          "An IntelliJ / WebStorm / PyCharm plugin with the same features as the VS Code extension — sync, tree view, CodeLens, and commit guard.",
        status: "submitted" as const,
        category: "Extension",
        voteCount: 21,
      },
      {
        title: "Audit log export (CSV / JSON)",
        description:
          "Export audit logs to CSV or JSON for compliance reporting. Filter by date range, user, action type, and project before exporting.",
        status: "submitted" as const,
        category: "Dashboard",
        voteCount: 12,
      },
    ];

    const insertedIds = [];
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const id = await ctx.db.insert("featureRequests", {
        title: feature.title,
        description: feature.description,
        status: feature.status,
        category: feature.category,
        voteCount: feature.voteCount,
        createdAt: now - (features.length - i) * 3600_000, // stagger by 1 hour
        updatedAt: now - (features.length - i) * 3600_000,
      });
      insertedIds.push(id);
    }

    return {
      message: `Successfully seeded ${insertedIds.length} feature requests`,
      ids: insertedIds,
    };
  },
});
