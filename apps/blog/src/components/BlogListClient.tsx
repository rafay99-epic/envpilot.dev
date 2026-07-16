"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Search, Tag, Calendar, ArrowRight, Clock } from "lucide-react";
import { GlowCard, Stagger, StaggerItem } from "@envpilot/ui";
import type { BlogPostMeta } from "@/lib/schema";

interface Props {
  posts: BlogPostMeta[];
  allTags: string[];
}

export function BlogListClient({ posts, allTags }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tagFromUrl = searchParams.get("tag");

  const [search, setSearch] = useState("");

  const selectedTag: string | null =
    tagFromUrl && allTags.includes(tagFromUrl) ? tagFromUrl : null;

  // Tag counts (for displaying alongside filter chips)
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const tag of post.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [posts]);

  // Filtered posts
  const filtered = useMemo(() => {
    let result = posts;

    if (selectedTag) {
      result = result.filter((p) => p.tags.includes(selectedTag));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [posts, search, selectedTag]);

  // Featured post = most recent in the filtered set
  const featured = filtered.length > 0 ? filtered[0] : null;
  const rest = filtered.length > 1 ? filtered.slice(1) : [];

  const handleTagClick = (tag: string | null) => {
    if (tag === null || selectedTag === tag) {
      router.push("/", { scroll: false });
    } else {
      router.push(`/?tag=${encodeURIComponent(tag)}`, { scroll: false });
    }
  };

  return (
    <div>
      {/* ── Search bar ──────────────────────────────────────────── */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
        <input
          type="text"
          placeholder="Search posts by title, content, or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 py-3.5 pl-11 pr-4 font-mono text-sm text-zinc-200 placeholder-zinc-600 transition-all focus:border-green-500/40 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:bg-zinc-900/80"
        />
      </div>

      {/* ── Tag filter chips with counts ─────────────────────────── */}
      <div className="mb-10 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleTagClick(null)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] transition-all ${
            !selectedTag
              ? "border-green-500/40 bg-green-500/10 text-green-400 shadow-[0_0_12px_rgba(34,197,94,0.08)]"
              : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
          }`}
        >
          all
          <span className="text-[10px] text-zinc-600">({posts.length})</span>
        </button>
        {allTags.slice(0, 12).map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => handleTagClick(tag)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] transition-all ${
              selectedTag === tag
                ? "border-green-500/40 bg-green-500/10 text-green-400 shadow-[0_0_12px_rgba(34,197,94,0.08)]"
                : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}
          >
            {tag}
            <span className="text-[10px] text-zinc-600">
              ({tagCounts.get(tag) ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* ── Results count ────────────────────────────────────────── */}
      <p className="mb-8 font-mono text-xs text-zinc-600">
        {filtered.length === 0
          ? "// no posts match your filter — try different keywords"
          : `// ${filtered.length} ${filtered.length === 1 ? "post" : "posts"} ${selectedTag ? `tagged #${selectedTag}` : ""}`}
      </p>

      {/* ── Featured post (hero card) ────────────────────────────── */}
      {featured && (
        <Link href={`/${featured.slug}`} className="group mb-8 block">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 via-zinc-900/40 to-zinc-950/80 p-6 transition-all duration-300 hover:border-green-500/30 hover:shadow-[0_0_32px_rgba(34,197,94,0.06)] sm:p-8">
            {/* Subtle green radial glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 opacity-20"
              style={{
                background:
                  "radial-gradient(circle, rgba(34,197,94,0.15), transparent 65%)",
              }}
            />

            <div className="relative">
              {/* Eyebrow */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/8 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-green-400">
                  featured
                </span>
                <span className="font-mono text-[11px] text-zinc-600">
                  {format(parseISO(featured.date), "MMMM d, yyyy")}
                </span>
                <span className="font-mono text-[11px] text-zinc-600">
                  {featured.readingTime}
                </span>
              </div>

              {/* Title with gradient text */}
              <h2 className="font-sans text-2xl font-bold tracking-tight text-zinc-100 transition-colors group-hover:text-green-400 sm:text-3xl">
                {featured.title}
              </h2>

              {/* Description */}
              <p className="mt-3 line-clamp-2 max-w-2xl font-mono text-sm leading-relaxed text-zinc-500">
                {featured.description}
              </p>

              {/* Author + tags */}
              <div className="mt-6 flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-green-500/20 bg-green-500/10 text-xs font-bold text-green-400">
                    {featured.author.name.charAt(0)}
                  </div>
                  <span className="font-mono text-sm text-zinc-300">
                    {featured.author.name}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {featured.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 font-mono text-[10px] text-zinc-500"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <span className="ml-auto hidden items-center gap-1 font-mono text-xs text-green-400 opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
                  Read post
                  <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ── Rest of posts (card grid) ────────────────────────────── */}
      {rest.length > 0 && (
        <>
          {/* Separator line when featured is shown */}
          {featured && (
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-green-500/20 via-zinc-800/60 to-transparent" />
              <span className="font-mono text-[11px] text-zinc-600">
                more articles
              </span>
            </div>
          )}

          <Stagger className="grid gap-5 sm:grid-cols-2">
            {rest.map((post) => (
              <StaggerItem key={post.slug}>
                <Link href={`/${post.slug}`} className="block h-full">
                  <GlowCard className="flex h-full flex-col p-5">
                    {/* Tags */}
                    {post.tags.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {post.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px] text-zinc-500"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Title */}
                    <h3 className="font-sans text-base font-bold tracking-tight text-zinc-100 transition-colors group-hover:text-green-400 sm:text-lg">
                      {post.title}
                    </h3>

                    {/* Description */}
                    <p className="mt-2 line-clamp-2 flex-1 font-mono text-xs leading-relaxed text-zinc-500">
                      {post.description}
                    </p>

                    {/* Meta */}
                    <div className="mt-4 flex items-center gap-3 border-t border-zinc-800/60 pt-3 font-mono text-[11px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(post.date), "MMM d, yyyy")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.readingTime}
                      </span>
                    </div>
                  </GlowCard>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 px-6 py-16 text-center">
          <Tag className="mb-4 h-8 w-8 text-zinc-700" />
          <p className="font-mono text-sm text-zinc-500">
            No posts match your current filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              router.push("/", { scroll: false });
            }}
            className="mt-4 rounded-full border border-zinc-800 px-4 py-1.5 font-mono text-xs text-zinc-400 transition-colors hover:border-green-500/30 hover:text-green-400"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
