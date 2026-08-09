import Link from "next/link";
import { SITE_URLS, terminal } from "@/components/marketing";

const LINKS = [
  {
    label: "→ read the source",
    href: SITE_URLS.github,
    external: true,
    accent: true,
  },
  { label: "→ changelog", href: "/changelog", external: false },
  { label: "→ public roadmap", href: "/wishlist", external: false },
  {
    label: "→ ceo@envpilot.dev",
    href: "mailto:ceo@envpilot.dev?subject=Envpilot%20feedback",
    external: true,
  },
];

const LINK_BASE = `${terminal.mono} text-[13px] transition-colors`;
const LINK_ACCENT = "text-green-400 hover:text-green-300";
const LINK_MUTED = "text-zinc-500 hover:text-zinc-200";

export function Why() {
  return (
    <section
      id="why"
      className={`scroll-mt-24 border-y ${terminal.line} bg-white/[0.015] py-24 sm:py-32`}
    >
      <div className={terminal.shell}>
        <p className={`${terminal.mono} text-[13px] text-zinc-600`}>
          <span aria-hidden className="mr-1.5 text-zinc-700">
            #
          </span>
          why this exists
        </p>

        <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="max-w-2xl space-y-6 font-sans text-[19px] leading-relaxed text-zinc-300">
            <p>
              Every team starts the same way. Someone pastes the .env into a
              channel so the new hire can run the app. It works, so it happens
              again. Two years later that message is still there, the keys still
              work, and three of the people who can read it have left.
            </p>
            <p>
              The tools that fix this are priced for companies with a
              procurement department. So small teams keep pasting, and the
              industry pretends that&apos;s a discipline problem rather than a
              tooling one.
            </p>
            <p className="text-zinc-100">
              Envpilot is the boring version: one flat price per organization,
              the whole platform MIT-licensed so you can read exactly how your
              secrets are handled — or run it yourself and never send us
              anything at all.
            </p>
          </div>

          <div
            className={`border-t ${terminal.line} pt-8 lg:border-t-0 lg:pt-0`}
          >
            <p className="font-sans text-[15px] leading-relaxed text-zinc-400">
              {
                "“It’s the tool I wanted: encrypted, synced, and boring to use.”"
              }
            </p>
            <p className={`mt-4 ${terminal.mono} text-[12px] text-zinc-500`}>
              Abdul Rafay — founder, and the person who answers your support
              email
            </p>
            <div className="mt-7 flex flex-col items-start gap-2.5">
              {LINKS.map((link) =>
                link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel={
                      link.href.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                    className={`${LINK_BASE} ${link.accent ? LINK_ACCENT : LINK_MUTED}`}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`${LINK_BASE} ${LINK_MUTED}`}
                  >
                    {link.label}
                  </Link>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
