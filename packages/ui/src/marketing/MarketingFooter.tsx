import Link from "next/link";
import { GlowDivider } from "./backgrounds";

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/**
 * Shared marketing footer: link columns, install snippet, watermark wordmark.
 * Link destinations are app-specific, so the caller supplies `columns`.
 */
export function MarketingFooter({ columns }: { columns: FooterColumn[] }) {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-canvas">
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-8 sm:px-6">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-accent-line bg-accent-soft font-mono text-sm font-bold text-accent">
                ❯
              </span>
              <span className="font-mono text-sm font-bold text-ink">
                envpilot
              </span>
            </Link>
            <p className="mt-4 max-w-xs font-mono text-xs leading-relaxed text-ink-faint">
              Encrypted environment variables for teams that live in the
              terminal. No .env files, no secrets in Slack.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2 font-mono text-xs text-ink-muted">
              <span className="text-accent">$</span>
              npm install -g @envpilot/cli
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <p className="font-mono text-[11px] uppercase tracking-widest text-accent/80">
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
                        className="font-mono text-xs text-ink-subtle transition-colors hover:text-accent"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="font-mono text-xs text-ink-subtle transition-colors hover:text-accent"
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
          <p className="font-mono text-xs text-ink-faint">
            &copy; {new Date().getFullYear()} Envpilot &middot; Built at{" "}
            <a
              href="https://syntaxlabtechnology.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-ink-muted"
            >
              Syntax Lab Technology
            </a>{" "}
            &middot;{" "}
            <a
              href="https://rafay99.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-ink-muted"
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
        {/* surface-hover, not ink-inverse: a near-black ghost ON the canvas,
            not text on a light fill. ink-inverse (#0a0a0a) sits one step off
            bg-canvas (#09090b) and renders invisible. */}
        <p
          className="-mb-8 text-center font-sans text-[18vw] font-black leading-none tracking-tighter text-surface-hover sm:-mb-12"
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
