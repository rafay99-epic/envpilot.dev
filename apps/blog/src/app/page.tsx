import { Suspense } from "react";
import type { Metadata } from "next";
import { SITE_URLS } from "@envpilot/ui";
import { BlogShell } from "@/components/shell";
import { getAllPosts } from "@/lib/content";
import { BlogListClient } from "@/components/BlogListClient";

export const metadata: Metadata = {
  title: "Blog | Envpilot",
  description:
    "Engineering, security, and building-in-public from the Envpilot team. Environment variable management, secrets security, and developer tooling.",
  alternates: { canonical: SITE_URLS.blog },
  openGraph: {
    title: "Blog | Envpilot",
    description:
      "Engineering, security, and building-in-public from the Envpilot team.",
    type: "website",
    url: SITE_URLS.blog,
  },
};

// Declares the Blog entity the individual posts point `isPartOf` at.
const blogSchema = {
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": `${SITE_URLS.blog}/#blog`,
  name: "Envpilot Blog",
  description:
    "Engineering, security, and building-in-public from the Envpilot team.",
  url: SITE_URLS.blog,
  inLanguage: "en",
  publisher: {
    "@type": "Organization",
    "@id": `${SITE_URLS.www}/#organization`,
    name: "Envpilot",
    url: SITE_URLS.www,
  },
};

export default function BlogPage() {
  const posts = getAllPosts();

  // Derive all unique tags from posts (avoids re-reading files).
  const allTags = Array.from(new Set(posts.flatMap((p) => p.tags))).sort();

  return (
    <BlogShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }}
      />
      {/* ── Compact hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="mx-auto max-w-5xl px-4 pt-20 pb-12 sm:px-6">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3 py-1 font-mono text-[11px] tracking-widest text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent [animation:pulse-glow_2.4s_ease-in-out_infinite]" />
              {"// blog"}
            </span>
            <h1 className="mt-3 font-sans text-3xl font-bold tracking-tight text-ink md:text-5xl">
              Engineering, security,{" "}
              <span className="text-accent">building in&nbsp;public</span>
            </h1>
            <p className="mt-3 max-w-2xl font-mono text-sm leading-relaxed text-ink-subtle">
              Stories, guides, and deep dives from the Envpilot team about
              environment variable management, secrets security, developer
              tooling, and building a startup in the open.{" "}
              <span className="text-ink-faint">{posts.length} posts</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── Blog listing ─────────────────────────────────────────── */}
      <section className="relative py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Suspense fallback={null}>
            <BlogListClient posts={posts} allTags={allTags} />
          </Suspense>
        </div>
      </section>
    </BlogShell>
  );
}
