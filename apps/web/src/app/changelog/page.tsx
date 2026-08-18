import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { docsComponents, MermaidChart, remarkMermaid } from "@envpilot/ui";
import { MarketingShell, PageHero, terminal } from "@/components/marketing";
import { ChangelogContent } from "@/components/changelog/ChangelogContent";
import { getChangelog } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog | Envpilot",
  description:
    "All the latest updates, improvements, and fixes to Envpilot. Follow along as we build.",
  alternates: { canonical: "/changelog" },
};

// Same MDX pipeline as the blog and the docs: shared component overrides,
// mermaid fences, and terminal-framed code blocks.
const mdxComponents = { ...docsComponents, MermaidChart };

const mdxOptions = {
  mdxOptions: {
    remarkPlugins: [remarkGfm, remarkMermaid],
    rehypePlugins: [
      [
        rehypePrettyCode,
        {
          theme: "github-dark-default",
          keepBackground: true,
          defaultLang: "bash",
          bypassInlineCode: true,
        },
      ],
    ],
  },
};

export default function ChangelogPage() {
  // content/CHANGELOG.md is read at build time. No Convex round trip, no
  // revalidate, no ISR writes — the page is fully static.
  const entries = getChangelog().map((entry) => ({
    id: entry.id,
    version: entry.version,
    title: entry.title,
    publishedAt: entry.publishedAt,
    types: entry.types,
    body: (
      <MDXRemote
        source={entry.content}
        components={mdxComponents}
        options={mdxOptions as never}
      />
    ),
  }));

  return (
    <MarketingShell>
      <PageHero
        eyebrow="changelog"
        title={
          <>
            What&apos;s new in <span className="text-accent">Envpilot</span>
          </>
        }
        description="All the latest updates, improvements, and fixes. Follow along as we build."
      />

      <section className="pb-24">
        <div className={terminal.shell}>
          <ChangelogContent entries={entries} />
        </div>
      </section>
    </MarketingShell>
  );
}
