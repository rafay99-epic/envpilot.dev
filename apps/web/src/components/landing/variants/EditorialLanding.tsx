"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function EditorialLanding() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {/* Header */}
      <header className="border-b border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-xl font-serif font-bold italic tracking-tight">
            Envpilot
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {["Platform", "Security", "Enterprise"].map((item) => (
              <Link key={item} href={`#${item.toLowerCase()}`} className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
                {item}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
              Log in
            </Link>
            <Link href="/sign-up" className="bg-stone-900 dark:bg-stone-100 px-4 py-2 text-sm font-medium text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="py-20 md:py-32">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.div variants={fadeIn} className="grid gap-12 md:grid-cols-12">
                <div className="md:col-span-8">
                  <p className="text-sm font-medium uppercase tracking-widest text-stone-400">
                    The future of secrets management
                  </p>
                  <h1 className="mt-6 font-serif text-5xl font-bold leading-[1.1] tracking-tight md:text-7xl lg:text-8xl">
                    Your team&apos;s secrets
                    deserve better
                    infrastructure
                  </h1>
                </div>
                <div className="flex flex-col justify-end md:col-span-4">
                  <p className="text-lg leading-relaxed text-stone-500 dark:text-stone-400">
                    Envpilot replaces insecure secret sharing with an encrypted vault,
                    granular access control, and tools that meet developers where they work.
                  </p>
                  <Link
                    href="/sign-up"
                    className="mt-8 inline-flex w-fit items-center gap-2 border-b-2 border-stone-900 dark:border-stone-100 pb-1 text-sm font-medium transition-all hover:gap-3"
                  >
                    Start free trial
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Divider line */}
        <div className="mx-auto max-w-6xl px-6">
          <div className="h-px bg-stone-200 dark:bg-stone-800" />
        </div>

        {/* Pull quote */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}>
              <blockquote className="font-serif text-2xl font-normal italic leading-relaxed text-stone-600 dark:text-stone-400 md:text-3xl">
                &ldquo;The average enterprise rotates over 50,000 secrets per year.
                Most do it manually, over channels that were never designed for sensitive data.&rdquo;
              </blockquote>
              <p className="mt-6 text-sm font-medium uppercase tracking-widest text-stone-400">
                Industry Report, 2025
              </p>
            </motion.div>
          </div>
        </section>

        {/* Divider line */}
        <div className="mx-auto max-w-6xl px-6">
          <div className="h-px bg-stone-200 dark:bg-stone-800" />
        </div>

        {/* Platform Section - Editorial two-column */}
        <section id="platform" className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
              <motion.div variants={fadeIn}>
                <p className="text-sm font-medium uppercase tracking-widest text-stone-400">Platform</p>
              </motion.div>

              <motion.div variants={fadeIn} className="mt-12 grid gap-16 md:grid-cols-2">
                {/* Left: Large feature */}
                <div>
                  <h2 className="font-serif text-4xl font-bold leading-tight tracking-tight md:text-5xl">
                    Three surfaces,<br />one source of truth
                  </h2>
                  <p className="mt-6 text-lg leading-relaxed text-stone-500 dark:text-stone-400">
                    Whether your team works from the terminal, the IDE, or the browser,
                    Envpilot keeps every secret encrypted, versioned, and access-controlled
                    from a single platform.
                  </p>
                </div>

                {/* Right: Feature list */}
                <div className="space-y-8">
                  {[
                    {
                      title: "Web Dashboard",
                      desc: "Manage projects, variables, team members, and audit logs. Approve member requests. Export compliance reports.",
                    },
                    {
                      title: "CLI Tool",
                      desc: "Pull, push, diff, init from your terminal. Dry-run mode for safe previews. CI/CD pipeline integration. Browser-based OAuth.",
                    },
                    {
                      title: "VS Code Extension",
                      desc: "Real-time WebSocket sync. Link multiple directories to different environments. Automatic file cleanup on access revocation.",
                    },
                  ].map((f) => (
                    <div key={f.title} className="border-l-2 border-stone-300 pl-6 dark:border-stone-700">
                      <h3 className="text-lg font-semibold">{f.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Full-width accent band */}
        <section className="bg-stone-900 py-16 text-white dark:bg-stone-100 dark:text-stone-900">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              className="grid grid-cols-2 gap-8 md:grid-cols-4"
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}
            >
              {[
                { val: "10M+", label: "Secrets encrypted" },
                { val: "5,000+", label: "Engineering teams" },
                { val: "99.99%", label: "Uptime guarantee" },
                { val: "SOC 2", label: "Type II certified" },
              ].map((s) => (
                <motion.div key={s.label} variants={fadeIn} className="text-center">
                  <p className="font-serif text-3xl font-bold md:text-4xl">{s.val}</p>
                  <p className="mt-1 text-sm opacity-60">{s.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Security Section - Editorial */}
        <section id="security" className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
              <motion.div variants={fadeIn} className="grid gap-16 md:grid-cols-12">
                <div className="md:col-span-5">
                  <p className="text-sm font-medium uppercase tracking-widest text-stone-400">Security</p>
                  <h2 className="mt-4 font-serif text-4xl font-bold leading-tight tracking-tight md:text-5xl">
                    Zero-knowledge by design
                  </h2>
                </div>
                <div className="md:col-span-7 md:pt-12">
                  <div className="space-y-8 text-lg leading-relaxed text-stone-500 dark:text-stone-400">
                    <p>
                      Every secret stored in Envpilot is encrypted using AES-256 via
                      WorkOS Vault. The platform stores only vault references — never
                      the plaintext values themselves. Each organization has cryptographic
                      isolation through unique key derivation.
                    </p>
                    <p>
                      Access control operates on two layers: organization-level RBAC
                      (Admin, Team Lead, Member) and variable-level permissions with
                      optional expiration dates. Members can&apos;t create variables
                      directly — they submit requests that must be approved by a Team
                      Lead or Admin.
                    </p>
                    <p>
                      Every action is logged. Forty-plus event types capture reads,
                      writes, permission changes, authentication attempts, and more —
                      complete with IP addresses, user agents, and geographic location
                      data. Export any time for SOC 2 compliance.
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Divider */}
        <div className="mx-auto max-w-6xl px-6">
          <div className="h-px bg-stone-200 dark:bg-stone-800" />
        </div>

        {/* Features grid - Editorial cards */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              className="grid gap-px bg-stone-200 dark:bg-stone-800 md:grid-cols-3"
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}
            >
              {[
                { title: "Encrypted Vault", desc: "AES-256 encryption. Zero-knowledge architecture. Organization-scoped cryptographic isolation." },
                { title: "RBAC + Per-Variable", desc: "Three-tier roles. Per-variable permissions with expiration. Request and approval workflow." },
                { title: "Audit Trail", desc: "40+ action types. IP tracking. Geographic location. Date range filtering. SOC2 exports." },
                { title: "CLI Integration", desc: "Pull, push, diff. Dry-run previews. Environment targeting. Browser-based SSO authentication." },
                { title: "IDE Extension", desc: "WebSocket real-time sync. Multi-directory support. Automatic cleanup on access revocation." },
                { title: "Version History", desc: "Complete variable history. Point-in-time rollback (admin-only). Change tracking per environment." },
              ].map((f) => (
                <motion.div
                  key={f.title}
                  variants={fadeIn}
                  className="bg-stone-50 p-8 dark:bg-stone-950"
                >
                  <h3 className="font-serif text-xl font-bold">{f.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-stone-500 dark:text-stone-400">{f.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Enterprise Section */}
        <section id="enterprise" className="border-t border-stone-200 py-20 dark:border-stone-800">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
              <motion.div variants={fadeIn} className="grid gap-16 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium uppercase tracking-widest text-stone-400">Enterprise</p>
                  <h2 className="mt-4 font-serif text-4xl font-bold leading-tight tracking-tight">
                    Built for teams that can&apos;t afford to get security wrong
                  </h2>
                  <p className="mt-6 text-lg leading-relaxed text-stone-500 dark:text-stone-400">
                    From startups deploying their first production environment to
                    enterprises managing thousands of secrets across dozens of teams —
                    Envpilot scales with your security requirements.
                  </p>
                  <Link
                    href="/sign-up"
                    className="mt-8 inline-flex items-center gap-2 border-b-2 border-stone-900 dark:border-stone-100 pb-1 text-sm font-medium transition-all hover:gap-3"
                  >
                    Start free trial
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
                <div className="space-y-6">
                  {[
                    { q: "How are secrets stored?", a: "Encrypted in WorkOS Vault using AES-256. We store vault references, never plaintext. Each org has cryptographic isolation." },
                    { q: "What happens when someone leaves?", a: "Revoke access instantly. The VS Code extension automatically removes synced .env files via WebSocket in seconds." },
                    { q: "Can we audit who accessed what?", a: "Yes. 40+ action types with IP, user agent, and geographic location. Filter and export for compliance." },
                  ].map((faq) => (
                    <motion.div key={faq.q} variants={fadeIn} className="border-l-2 border-stone-300 pl-6 dark:border-stone-700">
                      <h4 className="font-semibold">{faq.q}</h4>
                      <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">{faq.a}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-stone-200 py-24 dark:border-stone-800">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}>
              <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
                Security infrastructure<br />your team can trust
              </h2>
              <p className="mt-6 text-lg text-stone-500 dark:text-stone-400">
                Free to start. No credit card required.
              </p>
              <div className="mt-8 flex items-center justify-center gap-4">
                <Link href="/sign-up" className="bg-stone-900 dark:bg-stone-100 px-6 py-3 text-sm font-medium text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors">
                  Start free trial
                </Link>
                <Link href="/sign-in" className="border border-stone-300 dark:border-stone-700 px-6 py-3 text-sm text-stone-500 hover:border-stone-400 dark:hover:border-stone-600 transition-colors">
                  Contact sales
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 py-12 dark:border-stone-800">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div>
              <span className="font-serif text-lg font-bold italic">Envpilot</span>
              <p className="mt-1 text-xs text-stone-400">
                &copy; {new Date().getFullYear()} Envpilot. All rights reserved.
              </p>
            </div>
            <div className="flex gap-6">
              {["Privacy", "Terms", "Changelog", "Status"].map((l) => (
                <Link key={l} href={`/${l.toLowerCase()}`} className="text-sm text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors">
                  {l}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
