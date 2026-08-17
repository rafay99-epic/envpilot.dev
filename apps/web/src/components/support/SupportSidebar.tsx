import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { SITE_URLS, terminal } from "@/components/marketing";

const QUICK_LINKS = [
  { href: SITE_URLS.docs, label: "Documentation" },
  { href: "/changelog", label: "Changelog" },
  { href: "/wishlist", label: "Feature requests" },
  { href: "/contact", label: "Contact us" },
];

export function SupportSidebar() {
  return (
    <div className="sticky top-24 space-y-3">
      <div className={`${terminal.panel} p-5`}>
        <div className="flex items-center gap-2 font-sans text-[15px] font-semibold text-ink">
          <LifeBuoy className="h-4 w-4 text-accent" />
          Quick links
        </div>
        <ul className="mt-4 space-y-2.5">
          {QUICK_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`flex items-center gap-2 ${terminal.mono} text-[13px] text-ink-subtle transition-colors hover:text-accent`}
              >
                <span className="text-accent">❯</span>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${terminal.panel} p-5`}>
        <p
          className={`${terminal.mono} text-[11px] tracking-[0.14em] text-ink-faint uppercase`}
        >
          response time
        </p>
        <p className="mt-2 font-sans text-[15px] leading-relaxed text-ink-muted">
          We typically respond to support tickets within{" "}
          <span className="text-accent">24 hours</span> on business days.
        </p>
      </div>

      <div className={`${terminal.panel} p-5`}>
        <p
          className={`${terminal.mono} text-[11px] tracking-[0.14em] text-ink-faint uppercase`}
        >
          email us directly
        </p>
        <a
          href="mailto:support@envpilot.dev"
          className={`mt-2 block ${terminal.mono} text-[13px] text-accent underline-offset-4 hover:underline`}
        >
          support@envpilot.dev
        </a>
      </div>
    </div>
  );
}
