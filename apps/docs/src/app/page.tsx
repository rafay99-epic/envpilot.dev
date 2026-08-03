import type { Metadata } from "next";
import Link from "next/link";
import { getNavigation } from "@/lib/content";
import { DocsShell } from "@/components/shell";
import { DocsSearch } from "@/components/DocsSearch";
import { DOC_ICONS } from "@/components/DocsSidebar";
import { GlowCard, GlowDivider, Reveal, SITE_URLS } from "@envpilot/ui";

export const metadata: Metadata = {
  title: "Documentation | Envpilot",
  description:
    "Complete documentation for Envpilot: CLI, VS Code extension, GitHub Action, REST API, MCP server, web dashboard, and the platform rules behind them.",
  alternates: { canonical: SITE_URLS.docs },
};

const ENTRY_POINTS = [
  {
    href: "/start/quickstart",
    label: "Quickstart",
    blurb: "Sign up, create a project, ship your first secret.",
  },
  {
    href: "/cli/overview",
    label: "CLI",
    blurb: "Pull, push, run, and manage secret files from the terminal.",
  },
  {
    href: "/api/overview",
    label: "API Reference",
    blurb: "Read-only REST for everything that isn't a person.",
  },
];

export default function DocsHome() {
  const sections = getNavigation();

  return (
    <DocsShell>
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-24 sm:px-6 lg:px-8">
        <Reveal>
          <header>
            <p className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 [animation:pulse-glow_2.4s_ease-in-out_infinite]" />
              {"// documentation"}
            </p>
            <h1 className="mt-5 font-sans text-4xl font-bold tracking-tight text-zinc-100 md:text-5xl">
              Envpilot docs
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400">
              Five client surfaces over one enforcement core. Start with the
              quickstart, or jump straight to the surface you are wiring up —
              every page states what it does, how to use it, and exactly where
              its limits are.
            </p>
            <div className="mt-7 max-w-sm">
              <DocsSearch />
            </div>
          </header>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {ENTRY_POINTS.map((entry) => (
            <Link key={entry.href} href={entry.href} className="block h-full">
              <GlowCard className="h-full">
                <div className="flex h-full flex-col gap-2 p-5">
                  <span className="font-sans text-base font-semibold text-zinc-100">
                    {entry.label}
                  </span>
                  <span className="text-sm leading-relaxed text-zinc-500">
                    {entry.blurb}
                  </span>
                </div>
              </GlowCard>
            </Link>
          ))}
        </div>

        <GlowDivider className="mt-14" />

        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => {
            const Icon = DOC_ICONS[section.icon] ?? DOC_ICONS["file-text"];
            return (
              <section key={section.slug}>
                <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-green-400">
                  <Icon className="h-3.5 w-3.5" />
                  {section.label}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                  {section.blurb}
                </p>
                <ul className="mt-3 space-y-1">
                  {section.items.map((item) => (
                    <li key={item.slug}>
                      <Link
                        href={`/${item.slug}`}
                        className="block rounded px-2 py-1 text-sm text-zinc-400 transition-colors hover:bg-zinc-900/60 hover:text-green-400"
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </DocsShell>
  );
}
