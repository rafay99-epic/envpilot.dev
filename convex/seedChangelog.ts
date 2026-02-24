import { mutation } from "./_generated/server";

/**
 * Seed mutation to populate changelog with sample entries
 * Run this once to add initial changelog data for testing
 */
export const seedChangelog = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // Check if changelog already has entries
    const existingEntries = await ctx.db.query("changelog").take(1);
    if (existingEntries.length > 0) {
      return { message: "Changelog already has entries, skipping seed" };
    }

    const entries = [
      {
        title: "Introducing ENV Connect",
        content: `We're excited to launch ENV Connect, a secure platform for managing environment variables across your team.

## Key Features

- **End-to-end encryption** - All secrets are encrypted using WorkOS Vault
- **Real-time sync** - Changes propagate instantly to all team members
- **Role-based access** - Control who can view and modify each secret
- **Audit logging** - Track every access and change

### Getting Started

1. Sign up for a free account
2. Create your first organization
3. Invite your team members
4. Start managing your secrets securely

We can't wait to see what you build with ENV Connect!`,
        version: "v1.0.0",
        type: "feature" as const,
        isPublished: true,
        publishedAt: now - 30 * day,
        createdAt: now - 30 * day,
        updatedAt: now - 30 * day,
      },
      {
        title: "VS Code Extension Released",
        content: `The ENV Connect VS Code extension is now available! Sync your environment variables directly to your local \`.env\` files.

## Features

- **One-click sync** - Pull variables from any project with a single click
- **Auto-completion** - Get IntelliSense support for your environment variables
- **Status bar integration** - See sync status at a glance

### Installation

1. Open VS Code
2. Go to Extensions (Cmd/Ctrl + Shift + X)
3. Search for "ENV Connect"
4. Click Install

The extension is also available for Cursor IDE!`,
        version: "v1.1.0",
        type: "feature" as const,
        isPublished: true,
        publishedAt: now - 21 * day,
        createdAt: now - 21 * day,
        updatedAt: now - 21 * day,
      },
      {
        title: "Fixed Variable Duplication Bug",
        content: `We fixed a bug where variables could be duplicated when creating them in rapid succession.

## Details

When multiple team members created variables simultaneously, there was a race condition that could result in duplicate entries. This has been resolved with improved concurrency handling.

### Affected Users

If you experienced duplicate variables, they should now be automatically deduplicated. Please reach out to support if you notice any issues.`,
        version: "v1.1.1",
        type: "fix" as const,
        isPublished: true,
        publishedAt: now - 14 * day,
        createdAt: now - 14 * day,
        updatedAt: now - 14 * day,
      },
      {
        title: "Performance Improvements",
        content: `We've made significant performance improvements across the platform.

## What's Improved

- **Dashboard load time** reduced by 40%
- **Variable list** now uses virtualization for large projects
- **Search** is now instant with debounced queries

### Technical Details

- Implemented React Server Components for initial page loads
- Added Redis caching for frequently accessed data
- Optimized database queries with better indexing`,
        version: "v1.2.0",
        type: "improvement" as const,
        isPublished: true,
        publishedAt: now - 7 * day,
        createdAt: now - 7 * day,
        updatedAt: now - 7 * day,
      },
      {
        title: "Security Patch: Token Rotation",
        content: `We've implemented automatic token rotation for enhanced security.

## Changes

- API tokens now rotate automatically every 90 days
- Old tokens remain valid for 7 days after rotation for graceful migration
- Admins can now force-rotate tokens for any team member

### Action Required

No action is required on your part. Tokens will rotate automatically, and you'll receive an email notification before expiration.

For CI/CD integrations, we recommend using our new [service account tokens](/docs/service-accounts) which have longer lifespans.`,
        version: "v1.2.1",
        type: "security" as const,
        isPublished: true,
        publishedAt: now - 3 * day,
        createdAt: now - 3 * day,
        updatedAt: now - 3 * day,
      },
      {
        title: "CLI Tool v2.0 with Breaking Changes",
        content: `We've released a major update to the CLI tool with some breaking changes.

## Breaking Changes

- The \`env-connect pull\` command now requires a project flag: \`env-connect pull --project=myapp\`
- Configuration file renamed from \`.envconnect\` to \`.envconnect.json\`
- Dropped support for Node.js 14 and 16

## New Features

- **Interactive mode**: Run \`env-connect\` without arguments for a guided experience
- **Diff support**: See what changes before applying with \`--dry-run\`
- **Multiple environments**: Pull from multiple environments in one command

### Migration Guide

\`\`\`bash
# Old command
env-connect pull

# New command
env-connect pull --project=myapp

# Or set default project in config
echo '{"defaultProject": "myapp"}' > .envconnect.json
\`\`\``,
        version: "v2.0.0",
        type: "breaking" as const,
        isPublished: true,
        publishedAt: now - 1 * day,
        createdAt: now - 1 * day,
        updatedAt: now - 1 * day,
      },
    ];

    // Insert all entries
    const insertedIds = [];
    for (const entry of entries) {
      const id = await ctx.db.insert("changelog", entry);
      insertedIds.push(id);
    }

    return {
      message: `Successfully seeded ${insertedIds.length} changelog entries`,
      ids: insertedIds,
    };
  },
});
