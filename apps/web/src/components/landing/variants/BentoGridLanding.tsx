"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.07 } },
};

function BentoCard({
  children,
  className = "",
  span = "col-span-1",
}: {
  children: React.ReactNode;
  className?: string;
  span?: string;
}) {
  return (
    <motion.div
      variants={fadeIn}
      className={`group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/80 ${span} ${className}`}
    >
      {children}
    </motion.div>
  );
}

function MockTerminal({ lines }: { lines: { prefix?: string; cmd: string; output?: string }[] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black/60 font-mono text-xs">
      <div className="flex items-center gap-1.5 border-b border-zinc-800 px-3 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
        <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
      </div>
      <div className="space-y-1 p-3">
        {lines.map((line, i) => (
          <div key={i}>
            <p>
              <span className="text-emerald-400">{line.prefix || "$"}</span>{" "}
              <span className="text-zinc-300">{line.cmd}</span>
            </p>
            {line.output && <p className="text-zinc-500">{line.output}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockDashboardCard() {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">Environment Variables</span>
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
          Production
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {[
          { key: "DATABASE_URL", sensitive: true },
          { key: "STRIPE_SECRET_KEY", sensitive: true },
          { key: "NEXT_PUBLIC_APP_URL", sensitive: false },
          { key: "REDIS_URL", sensitive: true },
        ].map((v) => (
          <div key={v.key} className="flex items-center justify-between rounded bg-zinc-800/50 px-2 py-1.5">
            <span className="font-mono text-[10px] text-zinc-300">{v.key}</span>
            <div className="flex items-center gap-1.5">
              {v.sensitive && (
                <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[8px] text-amber-400">
                  sensitive
                </span>
              )}
              <span className="font-mono text-[10px] text-zinc-600">
                {v.sensitive ? "••••••••" : "https://app.envpilot.com"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockPermissionCard() {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3">
      <span className="text-xs font-medium text-zinc-400">Team Permissions</span>
      <div className="mt-3 space-y-2">
        {[
          { name: "Alice Chen", role: "Admin", color: "text-violet-400 bg-violet-500/10" },
          { name: "Bob Smith", role: "Team Lead", color: "text-amber-400 bg-amber-500/10" },
          { name: "Carol Davis", role: "Member", color: "text-blue-400 bg-blue-500/10" },
        ].map((m) => (
          <div key={m.name} className="flex items-center justify-between rounded bg-zinc-800/50 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[8px] font-bold text-zinc-300">
                {m.name[0]}
              </div>
              <span className="text-[10px] text-zinc-300">{m.name}</span>
            </div>
            <span className={`rounded px-1.5 py-0.5 text-[8px] font-medium ${m.color}`}>
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockAuditCard() {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3">
      <span className="text-xs font-medium text-zinc-400">Audit Log</span>
      <div className="mt-3 space-y-2">
        {[
          { action: "variable.accessed", user: "Alice", time: "2m ago", icon: "text-blue-400" },
          { action: "permission.granted", user: "Bob", time: "15m ago", icon: "text-emerald-400" },
          { action: "variable.updated", user: "Carol", time: "1h ago", icon: "text-amber-400" },
          { action: "project.created", user: "Alice", time: "3h ago", icon: "text-violet-400" },
        ].map((log, i) => (
          <div key={i} className="flex items-center justify-between rounded bg-zinc-800/50 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${log.icon.replace("text-", "bg-")}`} />
              <span className="font-mono text-[10px] text-zinc-400">{log.action}</span>
            </div>
            <span className="text-[9px] text-zinc-600">{log.user} &middot; {log.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BentoGridLanding() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/50 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400">
              <svg className="h-3.5 w-3.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <span className="text-sm font-semibold">Envpilot</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {["Features", "Security", "Pricing"].map((item) => (
              <Link key={item} href={`#${item.toLowerCase()}`} className="text-xs text-zinc-500 hover:text-white transition-colors">
                {item}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-xs text-zinc-500 hover:text-white transition-colors">Sign In</Link>
            <Link href="/sign-up" className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-medium text-black hover:bg-zinc-200 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-14">
        {/* Hero */}
        <section className="py-24 md:py-32">
          <div className="mx-auto max-w-6xl px-4">
            <motion.div initial="hidden" animate="visible" variants={stagger} className="text-center">
              <motion.div variants={fadeIn} className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Now with real-time WebSocket sync
              </motion.div>

              <motion.h1 variants={fadeIn} className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
                The modern way to manage{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  environment variables
                </span>
              </motion.h1>

              <motion.p variants={fadeIn} className="mx-auto mt-5 max-w-xl text-base text-zinc-500">
                Encrypted vault. Role-based access. CLI + IDE sync. One platform for
                every secret your team needs.
              </motion.p>

              <motion.div variants={fadeIn} className="mt-8 flex items-center justify-center gap-3">
                <Link href="/sign-up" className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 transition-colors">
                  Start Free
                </Link>
                <Link href="#features" className="rounded-lg border border-zinc-800 px-5 py-2.5 text-sm text-zinc-400 hover:border-zinc-700 hover:text-white transition-colors">
                  See Features
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Bento Grid */}
        <section id="features" className="pb-24">
          <div className="mx-auto max-w-6xl px-4">
            <motion.div
              className="grid gap-4 md:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {/* Large: Dashboard Preview */}
              <BentoCard span="md:col-span-2" className="p-6">
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Dashboard</p>
                <h3 className="mt-1 text-lg font-semibold">Everything in one place</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Manage variables, permissions, and audit logs from a unified dashboard.
                </p>
                <div className="mt-4">
                  <MockDashboardCard />
                </div>
              </BentoCard>

              {/* Small: Encryption */}
              <BentoCard className="flex flex-col justify-between p-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Security</p>
                  <h3 className="mt-1 text-lg font-semibold">Zero-knowledge vault</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    AES-256 encryption via WorkOS Vault. Even we can&apos;t read your secrets.
                  </p>
                </div>
                <div className="mt-4 rounded-lg border border-zinc-800 bg-black/40 p-3 font-mono text-xs">
                  <p className="text-zinc-600">// stored in database</p>
                  <p className="text-zinc-400">vaultRef: <span className="text-emerald-400">&quot;ref/db_prod_2847&quot;</span></p>
                  <p className="mt-2 text-zinc-600">// actual value</p>
                  <p className="text-zinc-400">value: <span className="text-red-400/50">&#x2588;&#x2588;&#x2588;&#x2588; inaccessible</span></p>
                </div>
              </BentoCard>

              {/* Small: CLI */}
              <BentoCard className="p-6">
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">CLI</p>
                <h3 className="mt-1 text-lg font-semibold">Terminal-native workflow</h3>
                <p className="mt-1 text-sm text-zinc-500">Pull, push, diff. Preview changes before applying.</p>
                <div className="mt-4">
                  <MockTerminal
                    lines={[
                      { cmd: "envpilot pull --env production" },
                      { prefix: "✓", cmd: "Synced 47 variables to .env" },
                      { cmd: "envpilot diff staging..production" },
                      { prefix: "+", cmd: "REDIS_URL (added in production)" },
                      { prefix: "~", cmd: "API_RATE_LIMIT (changed: 100 → 500)" },
                    ]}
                  />
                </div>
              </BentoCard>

              {/* Medium: Permissions */}
              <BentoCard span="md:col-span-2" className="p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Access Control</p>
                    <h3 className="mt-1 text-lg font-semibold">Granular permissions</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Three-tier RBAC: Admin, Team Lead, Member. Per-variable permissions
                      with optional expiration dates. Members submit requests for approval.
                    </p>
                    <div className="mt-4 space-y-2">
                      {[
                        { role: "Admin", desc: "Full access + rollback + permission management" },
                        { role: "Team Lead", desc: "Manage projects, variables, and team access" },
                        { role: "Member", desc: "Read-only. Must request variable access" },
                      ].map((r) => (
                        <div key={r.role} className="rounded-lg border border-zinc-800/50 bg-zinc-800/20 px-3 py-2">
                          <span className="text-xs font-medium text-zinc-300">{r.role}</span>
                          <p className="text-[11px] text-zinc-500">{r.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <MockPermissionCard />
                  </div>
                </div>
              </BentoCard>

              {/* Small: VS Code */}
              <BentoCard className="p-6">
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">IDE</p>
                <h3 className="mt-1 text-lg font-semibold">VS Code extension</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Real-time sync via WebSocket. Multi-directory support. Instant revocation.
                </p>
                <div className="mt-4 rounded-lg border border-zinc-800 bg-black/40 p-3 text-xs">
                  <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                    <div className="h-3 w-3 rounded bg-blue-500/20 flex items-center justify-center">
                      <span className="text-[6px] text-blue-400">EP</span>
                    </div>
                    <span className="font-medium text-zinc-400">Envpilot</span>
                    <span className="ml-auto rounded bg-emerald-500/10 px-1 text-[9px] text-emerald-400">synced</span>
                  </div>
                  <div className="mt-2 space-y-1 text-[10px]">
                    <p className="text-zinc-500">apps/api/.env <span className="text-zinc-600">← production</span></p>
                    <p className="text-zinc-500">apps/web/.env.local <span className="text-zinc-600">← development</span></p>
                    <p className="text-zinc-500">packages/sdk/.env <span className="text-zinc-600">← staging</span></p>
                  </div>
                </div>
              </BentoCard>

              {/* Medium: Audit */}
              <BentoCard span="md:col-span-2" className="p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Compliance</p>
                    <h3 className="mt-1 text-lg font-semibold">Complete audit trail</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      40+ action types tracked. IP addresses, user agents, geographic location.
                      Filter by category, date range, user. SOC2-ready exports.
                    </p>
                  </div>
                  <div>
                    <MockAuditCard />
                  </div>
                </div>
              </BentoCard>

              {/* Small: Request Workflow */}
              <BentoCard className="p-6">
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Governance</p>
                <h3 className="mt-1 text-lg font-semibold">Request &amp; approve</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Members submit variable requests. Admins review and approve. Perfect for regulated teams.
                </p>
                <div className="mt-4 space-y-2">
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-zinc-300">NEW_API_KEY</span>
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400">pending</span>
                    </div>
                    <p className="mt-1 text-[10px] text-zinc-500">Requested by Carol &middot; 5m ago</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-zinc-300">REDIS_URL</span>
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-400">approved</span>
                    </div>
                    <p className="mt-1 text-[10px] text-zinc-500">Approved by Alice &middot; 1h ago</p>
                  </div>
                </div>
              </BentoCard>
            </motion.div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-t border-zinc-800/50 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <motion.div
              className="grid grid-cols-2 gap-8 md:grid-cols-4"
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}
            >
              {[
                { val: "10M+", label: "Secrets managed" },
                { val: "5,000+", label: "Teams" },
                { val: "99.99%", label: "Uptime" },
                { val: "SOC2", label: "Compliant" },
              ].map((s) => (
                <motion.div key={s.label} variants={fadeIn} className="text-center">
                  <p className="text-2xl font-semibold md:text-3xl">{s.val}</p>
                  <p className="mt-1 text-xs text-zinc-500">{s.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-zinc-800/50 py-24">
          <div className="mx-auto max-w-2xl px-4 text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}>
              <h2 className="text-3xl font-semibold md:text-4xl">
                Start managing secrets the right way
              </h2>
              <p className="mt-4 text-zinc-500">Free to start. No credit card required.</p>
              <div className="mt-8 flex items-center justify-center gap-3">
                <Link href="/sign-up" className="rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 transition-colors">
                  Get Started Free
                </Link>
                <Link href="/sign-in" className="rounded-lg border border-zinc-800 px-6 py-2.5 text-sm text-zinc-400 hover:border-zinc-700 transition-colors">
                  Contact Sales
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-10">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-emerald-400 to-cyan-400">
                <svg className="h-3 w-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <span className="text-xs text-zinc-500">&copy; {new Date().getFullYear()} Envpilot</span>
            </div>
            <div className="flex gap-6">
              {["Privacy", "Terms", "Changelog", "Status"].map((link) => (
                <Link key={link} href={`/${link.toLowerCase()}`} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                  {link}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
