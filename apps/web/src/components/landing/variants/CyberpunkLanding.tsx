"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

function NeonText({
  children,
  color = "cyan",
  className = "",
}: {
  children: React.ReactNode;
  color?: "cyan" | "magenta" | "violet" | "green";
  className?: string;
}) {
  const shadows: Record<string, string> = {
    cyan: "0 0 10px #06b6d4, 0 0 40px #06b6d4, 0 0 80px #06b6d444",
    magenta: "0 0 10px #d946ef, 0 0 40px #d946ef, 0 0 80px #d946ef44",
    violet: "0 0 10px #8b5cf6, 0 0 40px #8b5cf6, 0 0 80px #8b5cf644",
    green: "0 0 10px #22c55e, 0 0 40px #22c55e, 0 0 80px #22c55e44",
  };
  const colors: Record<string, string> = {
    cyan: "text-cyan-400",
    magenta: "text-fuchsia-400",
    violet: "text-violet-400",
    green: "text-green-400",
  };

  return (
    <span className={`${colors[color]} ${className}`} style={{ textShadow: shadows[color] }}>
      {children}
    </span>
  );
}

function NeonButton({
  href,
  children,
  color = "cyan",
}: {
  href: string;
  children: React.ReactNode;
  color?: "cyan" | "magenta";
}) {
  const styles = {
    cyan: {
      border: "border-cyan-500/50",
      bg: "bg-cyan-500/10",
      hover: "hover:bg-cyan-500/20 hover:border-cyan-400",
      shadow: "0 0 15px rgba(6,182,212,0.3)",
      hoverShadow: "0 0 25px rgba(6,182,212,0.5)",
      text: "text-cyan-400",
    },
    magenta: {
      border: "border-fuchsia-500/50",
      bg: "bg-fuchsia-500/10",
      hover: "hover:bg-fuchsia-500/20 hover:border-fuchsia-400",
      shadow: "0 0 15px rgba(217,70,239,0.3)",
      hoverShadow: "0 0 25px rgba(217,70,239,0.5)",
      text: "text-fuchsia-400",
    },
  };
  const s = styles[color];

  return (
    <Link
      href={href}
      className={`group relative inline-flex items-center gap-2 rounded border ${s.border} ${s.bg} px-6 py-3 text-sm font-medium ${s.text} transition-all ${s.hover}`}
      style={{ boxShadow: s.shadow }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = s.hoverShadow; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = s.shadow; }}
    >
      {children}
    </Link>
  );
}

function ScanLine() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] opacity-[0.03]"
      style={{
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.1) 2px, rgba(0,255,255,0.1) 4px)",
      }}
    />
  );
}

export default function CyberpunkLanding() {
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 200);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const features = [
    { title: "ENCRYPTION", desc: "AES-256 vault encryption. Zero-knowledge. Your secrets are untouchable.", color: "cyan", borderColor: "border-l-cyan-500" },
    { title: "SSO AUTH", desc: "SAML/OIDC enterprise authentication. Multi-org workspaces.", color: "magenta", borderColor: "border-l-fuchsia-500" },
    { title: "ACCESS CTRL", desc: "Three-tier RBAC. Per-variable permissions. Principle of least privilege.", color: "violet", borderColor: "border-l-violet-500" },
    { title: "IDE SYNC", desc: "VS Code & Cursor extensions. Real-time .env sync. Zero friction.", color: "cyan", borderColor: "border-l-cyan-500" },
    { title: "CLI OPS", desc: "Pull, push, diff from terminal. CI/CD native. Pipeline-ready.", color: "green", borderColor: "border-l-green-500" },
    { title: "AUDIT LOG", desc: "Complete access trail. SOC2 exports. Full operational visibility.", color: "magenta", borderColor: "border-l-fuchsia-500" },
  ];

  const timeline = [
    { step: "01", title: "INSTALL", desc: "Deploy the CLI agent to your system", cmd: "npm i -g @envpilot/cli" },
    { step: "02", title: "AUTHENTICATE", desc: "Establish secure identity handshake", cmd: "envpilot login --sso" },
    { step: "03", title: "SYNCHRONIZE", desc: "Pull encrypted variables to local env", cmd: "envpilot pull --env prod" },
    { step: "04", title: "DEPLOY", desc: "Push changes across environments", cmd: "envpilot push --env staging" },
  ];

  return (
    <div className="relative min-h-screen bg-gray-950 text-gray-300">
      <ScanLine />

      {/* Grid background */}
      <div className="cyberpunk-grid fixed inset-0 opacity-100" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-md" style={{ borderBottom: "1px solid rgba(6,182,212,0.2)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-cyan-500/30" style={{ boxShadow: "0 0 10px rgba(6,182,212,0.2)" }}>
              <svg className="h-3.5 w-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <NeonText color="cyan" className="text-sm font-bold tracking-wider">
              ENVPILOT
            </NeonText>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {["SYSTEMS", "PROTOCOL", "INTEL"].map((item) => (
              <Link
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-[11px] font-medium uppercase tracking-[0.2em] text-gray-600 transition-colors hover:text-cyan-400"
              >
                {item}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-[11px] uppercase tracking-wider text-gray-600 hover:text-cyan-400">
              Access
            </Link>
            <NeonButton href="/sign-up" color="cyan">
              Initialize
            </NeonButton>
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-14">
        {/* Hero */}
        <section className="flex min-h-[90vh] items-center py-20">
          <div className="mx-auto max-w-6xl px-4">
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.div variants={fadeInUp} className="mb-6">
                <div
                  className="inline-flex items-center gap-2 rounded border border-cyan-500/20 bg-cyan-500/5 px-3 py-1 text-xs tracking-wider"
                  style={{ boxShadow: "0 0 10px rgba(6,182,212,0.1)" }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" style={{ animation: "neon-pulse 2s infinite" }} />
                  <span className="text-cyan-400/70">SYSTEM STATUS: OPERATIONAL</span>
                </div>
              </motion.div>

              <motion.h1
                variants={fadeInUp}
                className="text-5xl font-black uppercase tracking-tight md:text-7xl lg:text-8xl"
              >
                <span className="relative inline-block">
                  <NeonText color="cyan">ENCRYPT</NeonText>
                  {glitch && (
                    <span
                      className="absolute inset-0 text-red-500 opacity-70"
                      style={{ animation: "glitch-1 0.2s ease-in-out", clipPath: "inset(20% 0 60% 0)", transform: "translate(2px, 0)" }}
                    >
                      ENCRYPT
                    </span>
                  )}
                </span>
                <span className="text-gray-700">.</span>
                <br />
                <NeonText color="magenta">CONTROL</NeonText>
                <span className="text-gray-700">.</span>
                <br />
                <NeonText color="violet">DEPLOY</NeonText>
                <span className="text-gray-700">.</span>
              </motion.h1>

              <motion.p variants={fadeInUp} className="mt-8 max-w-lg text-sm leading-relaxed text-gray-500">
                Military-grade encryption for your environment variables.
                Role-based access control. CLI-native workflow. Zero compromise on security.
              </motion.p>

              <motion.div variants={fadeInUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <NeonButton href="/sign-up" color="cyan">
                  INITIALIZE PROTOCOL &rarr;
                </NeonButton>
                <NeonButton href="#systems" color="magenta">
                  VIEW SYSTEMS
                </NeonButton>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Stats HUD */}
        <section className="border-t border-cyan-500/10 py-12">
          <div className="mx-auto max-w-6xl px-4">
            <motion.div
              className="grid grid-cols-2 gap-4 md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {[
                { val: "10M+", label: "SECRETS ENCRYPTED", color: "cyan" },
                { val: "5,000+", label: "ACTIVE NODES", color: "magenta" },
                { val: "99.99%", label: "UPTIME SLA", color: "violet" },
                { val: "SOC2", label: "CERTIFIED", color: "green" },
              ].map((s) => (
                <motion.div
                  key={s.label}
                  variants={fadeInUp}
                  className="rounded border border-gray-800 bg-gray-900/50 p-4 text-center backdrop-blur-sm"
                  style={{ boxShadow: `inset 0 1px 0 rgba(6,182,212,0.1)` }}
                >
                  <NeonText color={s.color as "cyan" | "magenta" | "violet" | "green"} className="text-2xl font-bold md:text-3xl">
                    {s.val}
                  </NeonText>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-gray-600">
                    {s.label}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="systems" className="border-t border-gray-800/50 py-24">
          <div className="mx-auto max-w-6xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp}>
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-500/70">// SYSTEM MODULES</p>
              <h2 className="mt-2 text-3xl font-bold uppercase tracking-tight text-white md:text-4xl">
                Core Systems
              </h2>
            </motion.div>

            <motion.div
              className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {features.map((f) => (
                <motion.div
                  key={f.title}
                  variants={fadeInUp}
                  className={`rounded border-l-2 ${f.borderColor} border border-gray-800 bg-gray-900/50 p-5 backdrop-blur-sm transition-all hover:bg-gray-900/80`}
                >
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">
                    {f.desc}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Data Flow Visualization */}
        <section className="border-t border-gray-800/50 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp}>
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-500/70">// DATA FLOW</p>
              <h2 className="mt-2 text-3xl font-bold uppercase tracking-tight text-white md:text-4xl">
                Security Architecture
              </h2>
            </motion.div>

            <motion.div
              className="mt-12"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <div className="rounded border border-gray-800 bg-gray-900/50 p-8 backdrop-blur-sm">
                <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                  {[
                    { label: "CLIENT", sub: "CLI / IDE / Web", color: "cyan" },
                    { label: "API GATEWAY", sub: "Auth + Rate Limit", color: "magenta" },
                    { label: "ENVPILOT CORE", sub: "RBAC + Versioning", color: "violet" },
                    { label: "VAULT", sub: "AES-256 Encrypted", color: "green" },
                  ].map((node, i) => (
                    <div key={node.label} className="flex items-center gap-4">
                      <div className="text-center">
                        <div
                          className="mx-auto flex h-16 w-24 items-center justify-center rounded border border-gray-700 bg-gray-800/80"
                          style={{ boxShadow: `0 0 10px ${node.color === "cyan" ? "rgba(6,182,212,0.2)" : node.color === "magenta" ? "rgba(217,70,239,0.2)" : node.color === "violet" ? "rgba(139,92,246,0.2)" : "rgba(34,197,94,0.2)"}` }}
                        >
                          <NeonText color={node.color as "cyan" | "magenta" | "violet" | "green"} className="text-[10px] font-bold uppercase tracking-wider">
                            {node.label}
                          </NeonText>
                        </div>
                        <p className="mt-2 text-[10px] text-gray-600">{node.sub}</p>
                      </div>
                      {i < 3 && (
                        <div className="hidden items-center md:flex">
                          <div className="h-px w-8 bg-gradient-to-r from-cyan-500/50 to-transparent" />
                          <div className="h-2 w-2 rounded-full bg-cyan-500/50" style={{ animation: "neon-pulse 2s infinite" }} />
                          <div className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-500/50" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Timeline */}
        <section id="protocol" className="border-t border-gray-800/50 py-24">
          <div className="mx-auto max-w-4xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp}>
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-500/70">// INITIALIZATION PROTOCOL</p>
              <h2 className="mt-2 text-3xl font-bold uppercase tracking-tight text-white md:text-4xl">
                Setup Sequence
              </h2>
            </motion.div>

            <motion.div
              className="mt-12 space-y-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {timeline.map((t, i) => (
                <motion.div key={t.step} variants={fadeInUp} className="flex gap-6">
                  <div className="flex flex-col items-center">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-cyan-500/30 bg-cyan-500/5 text-sm font-bold text-cyan-400"
                      style={{ boxShadow: "0 0 10px rgba(6,182,212,0.2)" }}
                    >
                      {t.step}
                    </div>
                    {i < 3 && <div className="mt-2 h-full w-px bg-gradient-to-b from-cyan-500/30 to-transparent" />}
                  </div>
                  <div className="pb-8">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                      {t.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">{t.desc}</p>
                    <code
                      className="mt-3 inline-block rounded border border-gray-800 bg-gray-900/80 px-3 py-1.5 font-mono text-xs text-cyan-400/70"
                    >
                      $ {t.cmd}
                    </code>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Comparison */}
        <section id="intel" className="border-t border-gray-800/50 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              className="grid gap-6 md:grid-cols-2"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.div
                variants={fadeInUp}
                className="rounded border border-red-500/20 bg-red-500/5 p-6"
              >
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-red-400"
                  style={{ textShadow: "0 0 10px rgba(239,68,68,0.3)" }}
                >
                  // WITHOUT ENVPILOT
                </h3>
                <ul className="space-y-3">
                  {[
                    "Secrets shared via plaintext channels",
                    ".env files in version control",
                    "No access trail or audit log",
                    "Manual rotation across environments",
                    "Zero visibility into who has access",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-500">
                      <span className="mt-0.5 text-red-500">&#x2717;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div
                variants={fadeInUp}
                className="rounded border border-cyan-500/20 bg-cyan-500/5 p-6"
              >
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-cyan-400"
                  style={{ textShadow: "0 0 10px rgba(6,182,212,0.3)" }}
                >
                  // WITH ENVPILOT
                </h3>
                <ul className="space-y-3">
                  {[
                    "AES-256 encrypted vault storage",
                    "Auto-synced, never committed to git",
                    "Complete audit trail for every action",
                    "One-command sync across environments",
                    "Per-variable, role-based access control",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-400">
                      <span className="mt-0.5 text-cyan-400">&#x2713;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-gray-800/50 py-24">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp}>
              <div
                className="rounded border border-cyan-500/20 bg-gray-900/50 p-12 backdrop-blur-sm"
                style={{ boxShadow: "0 0 30px rgba(6,182,212,0.1)" }}
              >
                <h2 className="text-3xl font-bold uppercase tracking-tight text-white md:text-4xl">
                  Initialize{" "}
                  <NeonText color="cyan">Security</NeonText>{" "}
                  Protocol
                </h2>
                <p className="mt-4 text-sm text-gray-500">
                  Free tier available. No credit card required.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <NeonButton href="/sign-up" color="cyan">
                    START FREE TRIAL &rarr;
                  </NeonButton>
                  <NeonButton href="/sign-in" color="magenta">
                    ACCESS TERMINAL
                  </NeonButton>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800/50 py-8">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <NeonText color="cyan" className="text-xs font-bold tracking-wider">
              ENVPILOT v2.0
            </NeonText>
            <div className="flex gap-6">
              {["Privacy", "Terms", "Status", "Changelog"].map((link) => (
                <Link
                  key={link}
                  href={`/${link.toLowerCase()}`}
                  className="text-[11px] uppercase tracking-wider text-gray-700 transition-colors hover:text-cyan-400"
                >
                  {link}
                </Link>
              ))}
            </div>
            <p className="text-[11px] text-gray-700">
              &copy; {new Date().getFullYear()} Envpilot
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
