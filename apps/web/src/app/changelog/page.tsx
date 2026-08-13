import type { Metadata } from "next";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { MarketingShell, PageHero, terminal } from "@/components/marketing";
import {
  ChangelogContent,
  CHANGELOG_PAGE_SIZE,
  type ChangelogEntry,
} from "@/components/changelog/ChangelogContent";

export const metadata: Metadata = {
  title: "Changelog | Envpilot",
  description:
    "All the latest updates, improvements, and fixes to Envpilot. Follow along as we build.",
  alternates: { canonical: "/changelog" },
};

export const revalidate = 60; // revalidate every 60 seconds for fresh changelog data

export default async function ChangelogPage() {
  let entries: ChangelogEntry[] = [];
  try {
    entries =
      // First page only — the client pages the rest in on demand.
      ((await convex.query(
        api.features.community.changelog.queries.listPublished,
        {
          limit: CHANGELOG_PAGE_SIZE,
        }
      )) as ChangelogEntry[]) ?? [];
  } catch {
    // Graceful fallback — client will render empty state; page still builds in CI
  }

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
          <ChangelogContent initialEntries={entries} />
        </div>
      </section>
    </MarketingShell>
  );
}
