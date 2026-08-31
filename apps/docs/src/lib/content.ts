import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { cache } from "react";
import matter from "gray-matter";

export interface DocPage {
  slug: string; // full path slug, e.g. "cli/files"
  title: string;
  description: string;
  icon: string;
  version?: string;
  section: string; // section label, for the sidebar heading
  sectionSlug: string; // section folder, e.g. "cli"
  content: string; // raw MDX body (no frontmatter)
}

export interface DocSection {
  /** Folder name under content/ and the first URL segment. */
  slug: string;
  /** Sidebar heading. */
  label: string;
  /** One line shown on the docs home hub. */
  blurb: string;
  /** Key into DOC_ICONS. */
  icon: string;
  /** Page slugs relative to the section folder, in reading order. */
  pages: string[];
}

/**
 * Single source of truth for the information architecture: section order,
 * page order within a section, and the folder each page lives in.
 *
 * A page on disk that isn't listed here still renders — it lands at the end
 * of its section — so adding a doc never silently hides it.
 */
export const SECTIONS: DocSection[] = [
  {
    slug: "start",
    label: "Start Here",
    blurb: "Install, learn the model, ship your first secret.",
    icon: "chevron-right",
    pages: ["quickstart", "concepts", "architecture"],
  },
  {
    slug: "platform",
    label: "Platform",
    blurb:
      "How data is stored, who can reach it, and the rules every client obeys.",
    icon: "network",
    pages: [
      "data-model",
      "variables",
      "secret-files",
      "shared-accounts",
      "sharing",
      "doc-diagrams",
      "doc-sharing",
      "rbac",
      "requests",
      "rotation",
      "security",
    ],
  },
  {
    slug: "limits",
    label: "Plans & Limits",
    blurb: "Every quota, gate, and rate bucket in one place.",
    icon: "gauge",
    pages: ["plans", "rate-limits"],
  },
  {
    slug: "cli",
    label: "CLI",
    blurb: "Terminal-first secret management for humans and CI.",
    icon: "terminal",
    pages: [
      "overview",
      "auth",
      "link",
      "pull-push",
      "run",
      "secrets",
      "requests",
      "files",
      "reference",
      "ci",
    ],
  },
  {
    slug: "extension",
    label: "VS Code",
    blurb: "Real-time sync, commit protection, and editor intelligence.",
    icon: "puzzle",
    pages: [
      "overview",
      "sync",
      "protection",
      "editor",
      "commands",
      "settings",
      "troubleshooting",
    ],
  },
  {
    slug: "jetbrains",
    label: "JetBrains",
    blurb: "IntelliJ IDEA, Android Studio, PyCharm, GoLand and friends.",
    icon: "blocks",
    pages: ["overview", "sync", "protection", "troubleshooting"],
  },
  {
    slug: "action",
    label: "GitHub Action",
    blurb: "Pull variables and secret files into a workflow run.",
    icon: "github",
    pages: ["overview", "reference", "secret-files", "recipes", "security"],
  },
  {
    slug: "docker",
    label: "Docker",
    blurb: "Pull variables and secret files into a build or a container.",
    icon: "container",
    pages: ["overview", "build-time", "runtime", "compose", "reference"],
  },
  {
    slug: "api",
    label: "API Reference",
    blurb: "Read-only REST over org-scoped API keys.",
    icon: "plug",
    pages: [
      "overview",
      "quickstart",
      "authentication",
      "errors",
      "organization",
      "projects",
      "variables",
      "accounts",
      "files",
    ],
  },
  {
    slug: "mcp",
    label: "MCP Server",
    blurb: "Give a coding agent scoped, auditable access to secrets.",
    icon: "zap",
    pages: ["overview", "setup", "clients", "tools", "agent-requests"],
  },
  {
    slug: "dashboard",
    label: "Web Dashboard",
    blurb: "The full management surface at envpilot.dev.",
    icon: "monitor",
    pages: ["overview", "project", "organization"],
  },
  {
    slug: "integrations",
    label: "Integrations",
    blurb: "Push events out to the tools your team already watches.",
    icon: "plug",
    pages: ["notifications"],
  },
  {
    slug: "guides",
    label: "Guides",
    blurb: "End-to-end walkthroughs for real setups.",
    icon: "book",
    pages: ["migrate-from-dotenv", "nextjs", "android-keystore-ci", "agents"],
  },
];

const SECTION_BY_SLUG = new Map(SECTIONS.map((s) => [s.slug, s]));

// Content lives at the app root → apps/docs/content/
const CONTENT_DIR = resolve(process.cwd(), "content");

/**
 * Package versions resolved from the real package.json files at build time.
 *
 * Pages reference `{{cliVersion}}` and friends instead of hardcoding a number
 * in frontmatter, which is how the CLI reference ended up advertising 1.19.0
 * while npm served 1.20.0. A stale version string is now unrepresentable.
 */
function readVersion(relativePath: string): string {
  const path = resolve(process.cwd(), relativePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (cause) {
    throw new Error(`[docs/content] unreadable package.json: ${path}`, {
      cause,
    });
  }

  const version =
    typeof parsed === "object" && parsed !== null && "version" in parsed
      ? parsed.version
      : undefined;
  // Failing the build beats shipping a page that renders a literal
  // "{{cliVersion}}" because interpolate() had nothing to substitute.
  if (typeof version !== "string") {
    throw new Error(`[docs/content] no "version" string in ${path}`);
  }
  return version;
}

/**
 * The JetBrains plugin is a Gradle project: its version lives in
 * gradle.properties (`pluginVersion=`), not a package.json.
 */
function readGradleVersion(): string {
  const path = resolve(process.cwd(), "../jetbrains-plugin/gradle.properties");
  const props = readFileSync(path, "utf-8");
  const match = props.match(/^pluginVersion=(\S+)$/m);
  if (!match) {
    throw new Error(`[docs/content] no pluginVersion in ${path}`);
  }
  return match[1];
}

const PACKAGE_VERSIONS: Record<string, string> = {
  cliVersion: readVersion("../cli/package.json"),
  extensionVersion: readVersion("../vscode-extension/package.json"),
  actionVersion: readVersion("../../packages/github-action/package.json"),
  dockerVersion: readVersion("../../packages/docker-image/package.json"),
  webVersion: readVersion("../web/package.json"),
  jetbrainsVersion: readGradleVersion(),
};

/**
 * Interpolate variables into MDX text.
 *
 * `{{key}}` resolves against the page's own frontmatter first, then the
 * shared package versions above.
 */
function interpolate(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = vars[key] ?? PACKAGE_VERSIONS[key];
    return value != null ? String(value) : match;
  });
}

/**
 * Read and parse a single MDX file by full slug ("cli/files").
 *
 * Wrapped in React cache() so generateMetadata, the page body, and
 * prev/next lookups within one request parse each file exactly once.
 */
export const getDocBySlug = cache(function getDocBySlug(
  slug: string
): DocPage | null {
  // Every doc is "<section>/<page>" with both segments plain — this also
  // keeps a crafted slug from walking out of the content directory.
  const segments = slug.split("/");
  if (segments.length !== 2 || segments.some((s) => !/^[a-z0-9-]+$/.test(s))) {
    return null;
  }
  const [sectionSlug] = segments;

  try {
    const raw = readFileSync(join(CONTENT_DIR, `${slug}.mdx`), "utf-8");
    const { data, content } = matter(raw);
    return {
      slug,
      title: (data.title as string) ?? slug,
      description: interpolate((data.description as string) ?? "", data),
      icon:
        (data.icon as string) ??
        SECTION_BY_SLUG.get(sectionSlug)?.icon ??
        "file-text",
      version: data.version
        ? interpolate(String(data.version), data)
        : undefined,
      section: SECTION_BY_SLUG.get(sectionSlug)?.label ?? sectionSlug,
      sectionSlug,
      content: interpolate(content, data),
    };
  } catch (error) {
    console.error("[docs/content] doc_load_failed", slug, error);
    return null;
  }
});

/** Page slugs on disk for one section: SECTIONS order first, then extras. */
function sectionSlugsOnDisk(section: DocSection): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(join(CONTENT_DIR, section.slug))) {
      if (entry.endsWith(".mdx")) files.push(entry.slice(0, -".mdx".length));
    }
  } catch {
    return [];
  }

  // Both filters below are membership tests, so the two sets are built once
  // rather than rescanning the arrays per element.
  const onDisk = new Set(files);
  const listed = new Set(section.pages);
  const ordered = section.pages.filter((page) => onDisk.has(page));
  const extras = files.filter((file) => !listed.has(file)).sort();
  return [...ordered, ...extras].map((page) => `${section.slug}/${page}`);
}

/** Every doc slug in reading order (drives prev/next, sitemap, llms.txt). */
function getSortedSlugs(): string[] {
  return SECTIONS.flatMap(sectionSlugsOnDisk);
}

/**
 * Every doc page including its MDX body — one read+parse per file
 * (shared with getDocBySlug via cache()).
 */
export const getAllDocsFull = cache(function getAllDocsFull(): DocPage[] {
  return getSortedSlugs()
    .map((slug) => getDocBySlug(slug))
    .filter((doc): doc is DocPage => doc !== null);
});

/** Metadata for every doc page (sidebar, static params, feeds). */
export const getAllDocs = cache(function getAllDocs(): Omit<
  DocPage,
  "content"
>[] {
  return getAllDocsFull().map(({ content: _content, ...meta }) => meta);
});

/** Sections with their resolved pages — drives the sidebar and the home hub. */
export const getNavigation = cache(function getNavigation() {
  const docs = getAllDocs();
  // One pass: a section with no pages on disk is skipped rather than built
  // and then filtered back out.
  const navigation: (DocSection & { items: typeof docs })[] = [];
  for (const section of SECTIONS) {
    const items = docs.filter((doc) => doc.sectionSlug === section.slug);
    if (items.length > 0) navigation.push({ ...section, items });
  }
  return navigation;
});
