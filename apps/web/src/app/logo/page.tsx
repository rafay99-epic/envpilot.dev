import Image from "next/image";
import type { Metadata } from "next";
import {
  GlowDivider,
  MarketingShell,
  PageHero,
  Reveal,
} from "@/components/marketing";
import logoAsset from "../../../../../assets/logo.png";

export const metadata: Metadata = {
  title: "Brand Assets | Envpilot",
  description:
    "Download the official Envpilot application icon and find verified production URLs for platform integrations.",
  alternates: { canonical: "/logo" },
};

const PRODUCTION_URLS = [
  { label: "Website", value: "https://www.envpilot.dev" },
  { label: "Terms of Service", value: "https://www.envpilot.dev/terms" },
  { label: "Privacy Policy", value: "https://www.envpilot.dev/privacy" },
  {
    label: "Slack OAuth callback",
    value: "https://www.envpilot.dev/api/integrations/slack/callback",
  },
  {
    label: "Discord OAuth callback",
    value: "https://www.envpilot.dev/api/integrations/discord/callback",
  },
] as const;

const DISCORD_TAGS = [
  "Developer Tools",
  "DevOps",
  "Security",
  "Notifications",
  "Productivity",
] as const;

export default function LogoPage() {
  return (
    <MarketingShell>
      <PageHero eyebrow="brand" title="Envpilot brand assets" align="left">
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          The official application icon and production endpoints for Envpilot
          integrations, marketplace listings, and press references.
        </p>
      </PageHero>

      <GlowDivider />

      <section className="relative py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal>
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
              <div className="relative mx-auto aspect-square w-full max-w-lg overflow-hidden rounded-[2rem] border border-blue-400/20 bg-black shadow-[0_0_100px_-35px_rgba(59,130,246,0.75)]">
                <Image
                  src={logoAsset}
                  alt="Envpilot shield and terminal application icon"
                  fill
                  priority
                  sizes="(max-width: 1024px) 90vw, 480px"
                  className="object-cover"
                />
              </div>

              <div>
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-green-400">
                  Primary application icon
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
                  Envpilot logo
                </h2>
                <p className="mt-4 leading-relaxed text-zinc-400">
                  This square asset is provided for official Envpilot Slack and
                  Discord application profiles and approved references. Preserve
                  the artwork, colors, proportions, and dark background without
                  adding provider logos or text overlays. Other use requires
                  prior written consent.
                </p>

                <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-zinc-800 py-6 font-mono text-sm">
                  <div>
                    <dt className="text-zinc-500">Format</dt>
                    <dd className="mt-1 text-zinc-200">PNG</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Dimensions</dt>
                    <dd className="mt-1 text-zinc-200">1024 × 1024</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Aspect ratio</dt>
                    <dd className="mt-1 text-zinc-200">1:1</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Brand accent</dt>
                    <dd className="mt-1 text-green-400">#22C55E</dd>
                  </div>
                </dl>

                <a
                  href={logoAsset.src}
                  download="envpilot-logo-1024.png"
                  className="mt-7 inline-flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 px-5 py-3 font-mono text-sm font-medium text-green-300 transition-colors hover:border-green-400 hover:bg-green-500/15"
                >
                  Download original PNG <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-green-400">
              Marketplace copy
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
              App profile descriptions
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Copy this language into the Slack and Discord developer portals.
              It describes the current notification-only integration without
              implying that either app reads channel messages.
            </p>

            <div className="mt-10 divide-y divide-zinc-800 border-y border-zinc-800">
              <article className="grid gap-5 py-8 md:grid-cols-[10rem_1fr]">
                <h3 className="text-lg font-medium text-zinc-100">Slack</h3>
                <div className="space-y-5">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                      Short description
                    </p>
                    <p className="mt-2 leading-relaxed text-zinc-300">
                      Secure environment-variable and access-request
                      notifications for your team.
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                      Long description
                    </p>
                    <p className="mt-2 leading-relaxed text-zinc-300">
                      Envpilot connects a selected Slack channel to your
                      organization so your team receives project activity where
                      it already works. Get environment-variable change and
                      access-request updates for all projects or selected
                      projects. Notifications include useful project,
                      environment, actor, and status context&mdash;never secret
                      values. Authorized organization managers can test, pause,
                      reconfigure, or remove a destination at any time.
                    </p>
                  </div>
                </div>
              </article>

              <article className="grid gap-5 py-8 md:grid-cols-[10rem_1fr]">
                <h3 className="text-lg font-medium text-zinc-100">Discord</h3>
                <div className="space-y-5">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                      Description
                    </p>
                    <p className="mt-2 leading-relaxed text-zinc-300">
                      Envpilot sends secure project activity notifications to a
                      selected Discord channel. Receive environment-variable
                      change and access-request updates for all projects or only
                      the projects you choose, with useful context but never
                      secret values.
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                      Tags
                    </p>
                    <ul
                      className="mt-3 flex flex-wrap gap-2"
                      aria-label="Discord tags"
                    >
                      {DISCORD_TAGS.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-full border border-zinc-700 px-3 py-1 font-mono text-xs text-zinc-300"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-zinc-800/80 bg-zinc-950/50 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-green-400">
              Verified endpoints
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
              Production URLs
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Register the callback URL for the matching provider. The legal
              pages are public and intended for provider review and end users.
            </p>

            <dl className="mt-8 divide-y divide-zinc-800 border-y border-zinc-800">
              {PRODUCTION_URLS.map((item) => (
                <div
                  key={item.label}
                  className="grid gap-2 py-4 sm:grid-cols-[12rem_1fr] sm:items-center"
                >
                  <dt className="text-sm text-zinc-400">{item.label}</dt>
                  <dd className="overflow-x-auto font-mono text-sm text-zinc-200">
                    <a
                      href={item.value}
                      className="hover:text-green-400 hover:underline"
                    >
                      {item.value}
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
