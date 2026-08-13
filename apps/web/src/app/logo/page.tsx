import Image from "next/image";
import type { Metadata } from "next";
import {
  GlowDivider,
  MarketingShell,
  PageHero,
  Reveal,
} from "@/components/marketing";

export const metadata: Metadata = {
  title: "Brand Assets | Envpilot",
  description:
    "Download official Envpilot icons, marketplace artwork, and social cover images.",
  alternates: { canonical: "/logo" },
};

const COVER_ASSETS = [
  {
    title: "Discord discovery cover",
    description:
      "A 16:9 discovery and media-carousel cover with generous safe space for Discord's responsive layouts.",
    src: "/brand/envpilot-discord-cover-1920x1080.png",
    download: "envpilot-discord-cover-1920x1080.png",
    width: 1920,
    height: 1080,
    format: "PNG",
    use: "Discord · Discovery carousel",
  },
  {
    title: "Slack marketplace artwork",
    description:
      "An 8:5 listing visual sized to Slack Marketplace's recommended image dimensions and file requirements.",
    src: "/brand/envpilot-slack-marketplace-1600x1000.png",
    download: "envpilot-slack-marketplace-1600x1000.png",
    width: 1600,
    height: 1000,
    format: "PNG",
    use: "Slack · Marketplace listing",
  },
  {
    title: "Social sharing cover",
    description:
      "A lightweight Open Graph image for launch posts, changelog announcements, and shared links.",
    src: "/brand/envpilot-social-cover-1200x630.jpg",
    download: "envpilot-social-cover-1200x630.jpg",
    width: 1200,
    height: 630,
    format: "JPG",
    use: "Social · Open Graph",
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
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
          Official application icons and platform-ready artwork for Envpilot
          integrations, marketplace listings, launch posts, and press
          references.
        </p>
      </PageHero>

      <GlowDivider />

      <section className="relative py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal>
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
              <div className="relative mx-auto aspect-square w-full max-w-lg overflow-hidden rounded-[2rem] border border-info-line bg-black shadow-[0_0_100px_-35px_rgba(59,130,246,0.75)]">
                <Image
                  src="/brand/envpilot-app-icon-1024.png"
                  alt="Envpilot shield and terminal application icon"
                  fill
                  priority
                  sizes="(max-width: 1024px) 90vw, 480px"
                  className="object-cover"
                />
              </div>

              <div>
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
                  Primary application icon
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
                  Envpilot logo
                </h2>
                <p className="mt-4 leading-relaxed text-ink-muted">
                  This square asset is provided for official Envpilot Slack and
                  Discord application profiles and approved references. Preserve
                  the artwork, colors, proportions, and dark background without
                  adding provider logos or text overlays. Other use requires
                  prior written consent.
                </p>

                <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 font-mono text-sm">
                  <div>
                    <dt className="text-ink-subtle">Format</dt>
                    <dd className="mt-1 text-ink">PNG</dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Dimensions</dt>
                    <dd className="mt-1 text-ink">1024 × 1024</dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Aspect ratio</dt>
                    <dd className="mt-1 text-ink">1:1</dd>
                  </div>
                  <div>
                    <dt className="text-ink-subtle">Brand accent</dt>
                    <dd className="mt-1 text-accent">#22C55E</dd>
                  </div>
                </dl>

                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href="/brand/envpilot-app-icon-1024.png"
                    download="envpilot-app-icon-1024.png"
                    className="inline-flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-5 py-3 font-mono text-sm font-medium text-accent transition-colors hover:border-accent-line hover:bg-accent-soft"
                  >
                    Download 1024 PNG <span aria-hidden="true">↓</span>
                  </a>
                  <a
                    href="/brand/envpilot-slack-icon-512.png"
                    download="envpilot-slack-icon-512.png"
                    className="inline-flex items-center gap-2 rounded-lg border border-line px-5 py-3 font-mono text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    Slack 512 PNG <span aria-hidden="true">↓</span>
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-line bg-canvas/50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
              Platform artwork
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
              Covers for every surface
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Purpose-built exports with exact dimensions, consistent neon
              terminal styling, and clean crops that remain legible across
              marketplace and social layouts.
            </p>
          </Reveal>

          <div className="mt-12 divide-y divide-line border-y border-line">
            {COVER_ASSETS.map((asset) => (
              <Reveal key={asset.title}>
                <figure className="py-10 first:pt-8">
                  <div className="overflow-hidden rounded-2xl border border-info-line bg-black shadow-[0_0_80px_-45px_rgba(59,130,246,0.8)]">
                    <Image
                      src={asset.src}
                      alt={`${asset.title} for Envpilot`}
                      width={asset.width}
                      height={asset.height}
                      sizes="(max-width: 1200px) 92vw, 1100px"
                      className="h-auto w-full"
                    />
                  </div>

                  <figcaption className="mt-6 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
                        {asset.use}
                      </p>
                      <h3 className="mt-2 text-xl font-medium text-ink">
                        {asset.title}
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
                        {asset.description}
                      </p>
                      <p className="mt-3 font-mono text-xs text-ink-subtle">
                        {asset.width} × {asset.height} · {asset.format}
                      </p>
                    </div>

                    <a
                      href={asset.src}
                      download={asset.download}
                      className="inline-flex w-fit items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-4 py-2.5 font-mono text-sm text-accent transition-colors hover:border-accent-line hover:bg-accent-soft"
                    >
                      Download {asset.format} <span aria-hidden="true">↓</span>
                    </a>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
              Marketplace copy
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
              App profile descriptions
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Copy this language into the Slack and Discord developer portals.
              It describes the current notification-only integration without
              implying that either app reads channel messages.
            </p>

            <div className="mt-10 divide-y divide-line border-y border-line">
              <article className="grid gap-5 py-8 md:grid-cols-[10rem_1fr]">
                <h3 className="text-lg font-medium text-ink">Slack</h3>
                <div className="space-y-5">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
                      Short description
                    </p>
                    <p className="mt-2 leading-relaxed text-ink-muted">
                      Secure environment-variable and access-request
                      notifications for your team.
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
                      Long description
                    </p>
                    <p className="mt-2 leading-relaxed text-ink-muted">
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
                <h3 className="text-lg font-medium text-ink">Discord</h3>
                <div className="space-y-5">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
                      Description
                    </p>
                    <p className="mt-2 leading-relaxed text-ink-muted">
                      Envpilot sends secure project activity notifications to a
                      selected Discord channel. Receive environment-variable
                      change and access-request updates for all projects or only
                      the projects you choose, with useful context but never
                      secret values.
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
                      Tags
                    </p>
                    <ul
                      className="mt-3 flex flex-wrap gap-2"
                      aria-label="Discord tags"
                    >
                      {DISCORD_TAGS.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-full border border-line px-3 py-1 font-mono text-xs text-ink-muted"
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
    </MarketingShell>
  );
}
