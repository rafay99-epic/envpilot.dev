import Link from "next/link";
import { GlowDivider } from "./backgrounds";
import { StatusIndicator } from "./StatusIndicator";

const FOOTER_COLUMNS = [
  {
    title: "product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
      { label: "Wishlist", href: "/wishlist" },
    ],
  },
  {
    title: "resources",
    links: [
      { label: "Getting Started", href: "/docs/getting-started" },
      { label: "CLI Reference", href: "/docs/cli" },
      { label: "VS Code Extension", href: "/docs/extension" },
      { label: "Security", href: "/docs/security" },
    ],
  },
  {
    title: "compare",
    links: [
      { label: "vs Doppler", href: "/vs/doppler" },
      { label: "vs Infisical", href: "/vs/infisical" },
      { label: "vs .env files", href: "/vs/dotenv" },
    ],
  },
  {
    title: "support",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "Support", href: "/support" },
      { label: "Contact", href: "/contact" },
      { label: "Docs", href: "/docs" },
      {
        label: "Status",
        href: "https://stats.uptimerobot.com/FxXv9XmG1h",
        external: true,
      },
    ],
  },
  {
    title: "legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

/** Shared marketing footer: link columns, install snippet, watermark wordmark. */
export function MarketingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-zinc-800/60 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-8 sm:px-6">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-green-500/30 bg-green-500/10 font-mono text-sm font-bold text-green-400">
                ❯
              </span>
              <span className="font-mono text-sm font-bold text-zinc-100">
                envpilot
              </span>
            </Link>
            <p className="mt-4 max-w-xs font-mono text-xs leading-relaxed text-zinc-600">
              Encrypted environment variables for teams that live in the
              terminal. No .env files, no secrets in Slack.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-400">
              <span className="text-green-500">$</span>
              npm install -g @envpilot/cli
            </div>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="font-mono text-[11px] uppercase tracking-widest text-green-500/80">
                {`// ${column.title}`}
              </p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-zinc-500 transition-colors hover:text-green-400"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="font-mono text-xs text-zinc-500 transition-colors hover:text-green-400"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <GlowDivider className="mt-12" />

        <div className="flex flex-col items-center justify-between gap-4 pt-6 sm:flex-row">
          <StatusIndicator />
          <p className="font-mono text-xs text-zinc-700">
            &copy; {new Date().getFullYear()} Envpilot &middot; Built at{" "}
            <a
              href="https://syntaxlabtechnology.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-zinc-400"
            >
              Syntax Lab Technology
            </a>{" "}
            &middot;{" "}
            <a
              href="https://rafay99.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-zinc-400"
            >
              Abdul Rafay
            </a>
          </p>
        </div>
      </div>

      {/* Watermark wordmark */}
      <div
        aria-hidden
        className="pointer-events-none select-none overflow-hidden"
      >
        <p
          className="-mb-8 text-center font-sans text-[18vw] font-black leading-none tracking-tighter text-zinc-900 sm:-mb-12"
          style={{
            maskImage: "linear-gradient(to bottom, black 10%, transparent 75%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 10%, transparent 75%)",
          }}
        >
          ENVPILOT
        </p>
      </div>
    </footer>
  );
}
