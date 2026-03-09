"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

function MeshBlob({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={`absolute rounded-full blur-[100px] ${className}`}
      style={style}
      animate={{
        scale: [1, 1.15, 1],
        x: [0, 20, 0],
        y: [0, -15, 0],
      }}
      transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export default function GradientMeshLanding() {
  const features = [
    {
      title: "Zero-knowledge encryption",
      desc: "Secrets are encrypted in WorkOS Vault using AES-256. We store vault references, never plaintext values. Your data is cryptographically isolated per organization.",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      ),
    },
    {
      title: "Granular access control",
      desc: "Three-tier RBAC with per-variable permissions. Admins manage the organization. Team Leads grant access. Members request it. Every variable has its own access list with optional expiration.",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
          />
        </svg>
      ),
    },
    {
      title: "Request & approval workflow",
      desc: "Members can't create variables directly — they submit requests. Team Leads and Admins review and approve. Perfect for regulated environments where governance matters.",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.746 3.746 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
          />
        </svg>
      ),
    },
    {
      title: "CLI-native integration",
      desc: "Pull, push, diff from your terminal. Preview changes with --dry-run before applying. Integrates into CI/CD pipelines. Browser-based OAuth — no API keys to manage.",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      ),
    },
    {
      title: "Real-time IDE sync",
      desc: "VS Code extension with WebSocket-based sync. Link multiple directories to different environments. When access is revoked, synced .env files are automatically removed.",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
          />
        </svg>
      ),
    },
    {
      title: "Comprehensive audit logging",
      desc: "40+ action types tracked with IP addresses, user agents, and geographic location. Filter by category, date range, and user. Export reports for SOC2 compliance.",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
      {/* Mesh gradient background */}
      <div className="fixed inset-0 z-0">
        <MeshBlob
          className="h-[600px] w-[600px] bg-orange-600/15"
          style={{ top: "5%", left: "-5%" }}
        />
        <MeshBlob
          className="h-[500px] w-[500px] bg-amber-500/10"
          style={{ top: "40%", right: "-10%" }}
        />
        <MeshBlob
          className="h-[400px] w-[400px] bg-rose-600/10"
          style={{ bottom: "10%", left: "20%" }}
        />
        {/* Grain texture */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-zinc-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-amber-500">
              <svg
                className="h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <span className="text-base font-semibold tracking-tight">
              Envpilot
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {["Features", "Security", "Pricing"].map((item) => (
              <Link
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-sm text-zinc-500 hover:text-white transition-colors"
              >
                {item}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm text-zinc-500 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2 text-sm font-medium transition-all hover:shadow-[0_0_20px_rgba(249,115,22,0.3)]"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-16">
        {/* Hero */}
        <section className="flex min-h-[85vh] items-center py-24">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="max-w-3xl"
            >
              <motion.div
                variants={fadeIn}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/5 px-3.5 py-1 text-xs"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                <span className="text-orange-300/80">
                  Trusted by 5,000+ engineering teams
                </span>
              </motion.div>

              <motion.h1
                variants={fadeIn}
                className="text-5xl font-semibold tracking-tight leading-[1.1] md:text-6xl lg:text-7xl"
              >
                Infrastructure for
                <br />
                <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
                  secrets management
                </span>
              </motion.h1>

              <motion.p
                variants={fadeIn}
                className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400"
              >
                Envpilot provides the encryption, access control, and developer
                tooling that teams need to manage environment variables at
                scale. From startup to enterprise.
              </motion.p>

              <motion.div
                variants={fadeIn}
                className="mt-8 flex flex-col gap-3 sm:flex-row"
              >
                <Link
                  href="/sign-up"
                  className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-sm font-medium transition-all hover:shadow-[0_0_30px_rgba(249,115,22,0.3)]"
                >
                  Start building
                  <svg
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </Link>
                <Link
                  href="#features"
                  className="inline-flex items-center rounded-full border border-zinc-800 px-6 py-3 text-sm text-zinc-400 hover:border-zinc-700 hover:text-white transition-all"
                >
                  Read documentation
                </Link>
              </motion.div>

              <motion.div
                variants={fadeIn}
                className="mt-16 flex flex-wrap items-center gap-8"
              >
                {["Vercel", "Stripe", "Linear", "Notion", "Figma"].map((co) => (
                  <span key={co} className="text-sm font-medium text-zinc-700">
                    {co}
                  </span>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Built for security-conscious teams
              </h2>
              <p className="mt-3 max-w-lg text-zinc-500">
                Every feature designed around the principle that secrets should
                be encrypted, access-controlled, and fully auditable.
              </p>
            </motion.div>

            <motion.div
              className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {features.map((f) => (
                <motion.div key={f.title} variants={fadeIn} className="group">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 text-orange-400 transition-colors group-hover:border-orange-500/30 group-hover:bg-orange-500/5">
                    {f.icon}
                  </div>
                  <h3 className="text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    {f.desc}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* How it works */}
        <section id="security" className="border-t border-white/5 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                From install to production in minutes
              </h2>
            </motion.div>

            <motion.div
              className="mt-16 grid gap-12 md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {[
                {
                  step: "01",
                  title: "Install",
                  desc: "Add the CLI globally or the VS Code extension from the marketplace.",
                },
                {
                  step: "02",
                  title: "Authenticate",
                  desc: "Browser-based SSO login. No API keys to manage or rotate.",
                },
                {
                  step: "03",
                  title: "Configure",
                  desc: "Select your organization, project, and target environment.",
                },
                {
                  step: "04",
                  title: "Sync",
                  desc: "Pull variables to .env. Push changes back. Diff across environments.",
                },
              ].map((s) => (
                <motion.div key={s.step} variants={fadeIn}>
                  <span className="text-3xl font-semibold text-zinc-800">
                    {s.step}
                  </span>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-zinc-500">{s.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-t border-white/5 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              className="grid grid-cols-2 gap-8 md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {[
                { val: "10M+", label: "Secrets encrypted" },
                { val: "5,000+", label: "Teams" },
                { val: "99.99%", label: "Uptime SLA" },
                { val: "SOC2", label: "Compliant" },
              ].map((s) => (
                <motion.div
                  key={s.label}
                  variants={fadeIn}
                  className="text-center"
                >
                  <p className="text-3xl font-semibold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent md:text-4xl">
                    {s.val}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">{s.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section id="pricing" className="border-t border-white/5 py-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Start managing secrets today
              </h2>
              <p className="mt-4 text-zinc-500">
                Free tier available. No credit card required. Scale when
                you&apos;re ready.
              </p>
              <div className="mt-8 flex items-center justify-center gap-3">
                <Link
                  href="/sign-up"
                  className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-sm font-medium transition-all hover:shadow-[0_0_30px_rgba(249,115,22,0.3)]"
                >
                  Get started free
                </Link>
                <Link
                  href="/sign-in"
                  className="rounded-full border border-zinc-800 px-6 py-3 text-sm text-zinc-400 hover:border-zinc-700 transition-all"
                >
                  Contact sales
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-orange-400 to-amber-500">
                <svg
                  className="h-3 w-3 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
              <span className="text-xs text-zinc-600">
                &copy; {new Date().getFullYear()} Envpilot
              </span>
            </div>
            <div className="flex gap-6">
              {["Privacy", "Terms", "Changelog", "Status"].map((l) => (
                <Link
                  key={l}
                  href={`/${l.toLowerCase()}`}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
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
