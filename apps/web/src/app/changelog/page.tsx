import Link from "next/link";
import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { PublicHeaderButtons } from "@/components/landing/PublicHeaderButtons";
import {
  ChangelogContent,
  type ChangelogEntry,
} from "@/components/changelog/ChangelogContent";

export const metadata: Metadata = {
  title: "Changelog | Envpilot",
  description:
    "All the latest updates, improvements, and fixes to Envpilot. Follow along as we build.",
};

export const revalidate = 60; // revalidate every 60 seconds for fresh changelog data

export default async function ChangelogPage() {
  let entries: ChangelogEntry[] = [];
  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    entries =
      ((await convex.query(api.changelog.listPublished, {
        limit: 50,
      })) as ChangelogEntry[]) ?? [];
  } catch {
    // Graceful fallback — client will render empty state; page still builds in CI
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-green-400">
      {/* Header — server-rendered */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-green-400">$</span>
            <span className="font-bold text-zinc-100">envpilot</span>
            <span className="text-xs text-zinc-600">v1.0</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {[
              { label: "Changelog", href: "/changelog" },
              { label: "Wishlist", href: "/wishlist" },
              { label: "Docs", href: "/docs" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-xs text-zinc-500 transition-colors hover:text-green-400"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <PublicHeaderButtons />
          </div>
        </div>
      </header>

      <main className="pt-14">
        {/* Hero — server-rendered */}
        <section className="border-b border-zinc-800/50 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <p className="text-xs uppercase tracking-widest text-green-500">
              {"// changelog"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
              What&apos;s new in Envpilot
            </h1>
            <p className="mt-3 max-w-xl text-sm text-zinc-500">
              All the latest updates, improvements, and fixes. Follow along as
              we build.
            </p>

            {/* Client island for filter + entries */}
            <ChangelogContent initialEntries={entries} />
          </div>
        </section>
      </main>

      {/* Footer — server-rendered */}
      <footer className="border-t border-zinc-800/50 py-8">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span className="text-green-500">$</span> envpilot --version{" "}
              <span className="text-zinc-500">1.0.0</span>
            </div>
            <div className="flex gap-4 text-xs text-zinc-600">
              <Link href="/docs" className="hover:text-zinc-400">
                Docs
              </Link>
              <Link href="/changelog" className="hover:text-zinc-400">
                Changelog
              </Link>
              <Link href="/privacy" className="hover:text-zinc-400">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-zinc-400">
                Terms
              </Link>
              <Link href="/faq" className="hover:text-zinc-400">
                FAQ
              </Link>
              <Link href="/support" className="hover:text-zinc-400">
                Support
              </Link>
              <Link href="/contact" className="hover:text-zinc-400">
                Contact
              </Link>
            </div>
            <div className="text-right text-xs text-zinc-700">
              <p>&copy; {new Date().getFullYear()} Envpilot</p>
              <p className="text-[10px] text-zinc-800">
                Built at{" "}
                <a
                  href="https://syntaxlabtechnology.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-500"
                >
                  Syntax Lab Technology
                </a>{" "}
                &middot;{" "}
                <a
                  href="https://rafay99.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-500"
                >
                  Abdul Rafay
                </a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
