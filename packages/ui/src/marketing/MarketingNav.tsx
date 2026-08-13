"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
}

/**
 * Shared marketing navigation: transparent over the hero, condenses into a
 * glass bar after scroll. Active route gets the green prompt caret.
 *
 * Auth-aware controls are injected via `actions` (the web app supplies its
 * auth header buttons), and the nav destinations via `links`, so this
 * component stays free of app-specific auth/routing coupling.
 */
export function MarketingNav({
  links,
  actions,
}: {
  links: NavLink[];
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) =>
    href !== "/#features" && pathname.startsWith(href.split("#")[0]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
          ? "border-b border-line bg-canvas/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-accent-line bg-accent-soft font-mono text-sm font-bold text-accent transition-shadow group-hover:shadow-[0_0_16px_rgba(34,197,94,0.4)]">
            ❯
          </span>
          <span className="font-mono text-sm font-bold tracking-tight text-ink">
            envpilot
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-ink-subtle hover:bg-surface-hover hover:text-ink"
                }`}
              >
                {active && <span className="mr-1 text-accent">❯</span>}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">{actions}</div>

        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink-muted transition-colors hover:border-accent-line hover:text-accent md:hidden"
        >
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-line md:hidden"
          >
            <div className="space-y-1 px-4 py-4">
              {links.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block rounded-md px-3 py-2.5 font-mono text-sm transition-colors ${
                    isActive(item.href)
                      ? "bg-accent-soft text-accent"
                      : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                  }`}
                >
                  <span className="mr-2 text-accent/60">❯</span>
                  {item.label}
                </Link>
              ))}
              <div className="flex items-center gap-3 border-t border-line px-3 pt-4">
                {actions}
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
