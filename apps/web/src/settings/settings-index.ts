/**
 * Searchable index of every settings destination, across all three scopes.
 *
 * Settings live on three routes, so "where do I turn X off" is a hunt. The
 * command palette answers it instead. Keywords are what people type, not what
 * the tab is called — "rotate", "unsync", "invoice".
 *
 * Org and project entries need a slug, so they are only offered once the
 * palette knows the active organization / project.
 */
export type SettingsScope = "account" | "organization" | "project";

export interface SettingsIndexEntry {
  scope: SettingsScope;
  label: string;
  tab: string;
  keywords: string[];
}

export const SETTINGS_INDEX: SettingsIndexEntry[] = [
  {
    scope: "account",
    label: "Profile",
    tab: "general",
    keywords: ["name", "avatar", "email", "profile", "account"],
  },
  {
    scope: "account",
    label: "Notifications",
    tab: "notifications",
    keywords: ["email", "alerts", "digest", "notify"],
  },
  {
    scope: "account",
    label: "Integrations",
    tab: "integrations",
    keywords: ["cli", "extension", "vs code", "editor", "ide"],
  },
  {
    scope: "account",
    label: "Security",
    tab: "security",
    keywords: ["session", "sign out", "password", "device", "browser"],
  },
  {
    scope: "account",
    label: "Keyboard shortcuts",
    tab: "customization",
    keywords: ["shortcut", "keybinding", "hotkey", "keyboard", "theme"],
  },
  {
    scope: "account",
    label: "Billing",
    tab: "billing",
    keywords: ["plan", "invoice", "subscription", "upgrade", "cancel", "pro"],
  },
  {
    scope: "organization",
    label: "Organization profile",
    tab: "general",
    keywords: ["org", "rename", "slug", "plan"],
  },
  {
    scope: "organization",
    label: "Variable tags",
    tab: "tags",
    keywords: ["tag", "label", "colour", "color", "group"],
  },
  {
    scope: "organization",
    label: "API keys",
    tab: "apiKeys",
    keywords: ["api", "key", "token", "mcp", "ci", "cd", "service", "rotate"],
  },
  {
    scope: "organization",
    label: "Slack & Discord",
    tab: "integrations",
    keywords: ["slack", "discord", "webhook", "notification", "channel"],
  },
  {
    scope: "organization",
    label: "Delete organization",
    tab: "danger",
    keywords: ["delete", "danger", "transfer", "ownership", "close"],
  },
  {
    scope: "project",
    label: "Project profile",
    tab: "general",
    keywords: ["rename", "icon", "colour", "color", "description"],
  },
  {
    scope: "project",
    label: "VS Code sync",
    tab: "integrations",
    keywords: ["unsync", "vs code", "editor", "sync", "close"],
  },
  {
    scope: "project",
    label: "Delete project",
    tab: "danger",
    keywords: ["delete", "danger", "transfer", "move", "archive"],
  },
];

export function settingsHref(
  entry: SettingsIndexEntry,
  ctx: { orgSlug?: string | null; projectSlug?: string | null }
): string | null {
  switch (entry.scope) {
    case "account":
      return `/dashboard/settings?tab=${entry.tab}`;
    case "organization":
      return ctx.orgSlug
        ? `/organizations/${ctx.orgSlug}/settings?tab=${entry.tab}`
        : null;
    case "project":
      return ctx.projectSlug
        ? `/dashboard/projects/${ctx.projectSlug}/settings?tab=${entry.tab}`
        : null;
  }
}

/** Substring match over label + keywords; empty term matches nothing. */
export function searchSettings(
  term: string,
  ctx: { orgSlug?: string | null; projectSlug?: string | null },
  limit = 5
): { entry: SettingsIndexEntry; href: string }[] {
  const q = term.trim().toLowerCase();
  if (q.length < 2) return [];

  const hits: { entry: SettingsIndexEntry; href: string }[] = [];
  for (const entry of SETTINGS_INDEX) {
    const haystack = [entry.label, entry.scope, ...entry.keywords]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) continue;
    const href = settingsHref(entry, ctx);
    if (!href) continue;
    hits.push({ entry, href });
    if (hits.length >= limit) break;
  }
  return hits;
}
