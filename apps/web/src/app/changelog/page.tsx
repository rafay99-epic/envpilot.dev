import type { Metadata } from "next";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { MarketingShell, PageHero, GlowDivider } from "@/components/marketing";
import {
  ChangelogContent,
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
      ((await convex.query(api.changelog.listPublished, {
        limit: 50,
      })) as ChangelogEntry[]) ?? [];
  } catch {
    // Graceful fallback — client will render empty state; page still builds in CI
  }

  return (
    <MarketingShell>
      <PageHero
        eyebrow="changelog"
        title={
          <>
            What&apos;s new in <span className="text-green-400">Envpilot</span>
          </>
        }
        description="All the latest updates, improvements, and fixes. Follow along as we build."
        align="left"
      />

      <GlowDivider />

      <section className="relative py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <ChangelogContent initialEntries={entries} />
        </div>
      </section>
    </MarketingShell>
  );
}
