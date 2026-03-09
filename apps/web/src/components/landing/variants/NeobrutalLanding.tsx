"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 12 },
  },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardShadow = "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]";
const cardShadowHover = "hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]";
const cardBase = `border-4 border-black ${cardShadow} ${cardShadowHover} hover:-translate-x-1 hover:-translate-y-1 transition-all duration-200`;

export default function NeobrutalLanding() {
  const features = [
    { title: "Encryption", desc: "AES-256 at rest. Your secrets are locked down tight. Zero-knowledge vault.", bg: "bg-blue-300", emoji: "🔐" },
    { title: "SSO & Multi-Org", desc: "SAML, OIDC, multi-org workspaces. Enterprise-ready from day one.", bg: "bg-pink-300", emoji: "🏢" },
    { title: "Role-Based Access", desc: "Admin, Lead, Member. Per-variable permissions. You decide who sees what.", bg: "bg-green-300", emoji: "🛡️" },
    { title: "IDE Extensions", desc: "VS Code & Cursor plugins. Your .env syncs in real-time. No copy-paste.", bg: "bg-orange-300", emoji: "⚡" },
    { title: "CLI Tool", desc: "Pull, push, diff from terminal. CI/CD pipeline integration built right in.", bg: "bg-purple-300", emoji: "💻" },
    { title: "Audit Logs", desc: "Full access trail. Who viewed what, when. Export for SOC2 compliance.", bg: "bg-yellow-300", emoji: "📋" },
  ];

  const beforeAfter = {
    before: [
      "Sharing secrets via Slack DMs",
      ".env files committed to git",
      "No idea who accessed what",
      "Manual copy-paste for each environment",
      'New dev: "Can someone send me the env vars?"',
    ],
    after: [
      "Encrypted vault with access controls",
      "Auto-synced, never in version control",
      "Complete audit trail for every access",
      "One command: envpilot pull --env prod",
      'New dev: "envpilot pull" and they\'re set',
    ],
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFFEF5" }}>
      {/* Header */}
      <header className="border-b-4 border-black bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-black ${cardShadow.replace("4px", "2px").replace("4px", "2px")}`}>
              <span className="text-lg">🔑</span>
            </div>
            <span className="text-xl font-black tracking-tight">envpilot</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {["Features", "How It Works", "Compare"].map((item) => (
              <Link
                key={item}
                href={`#${item.toLowerCase().replace(/ /g, "-")}`}
                className="text-sm font-bold text-black/70 transition-colors hover:text-black"
              >
                {item}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-bold">
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className={`rounded-lg bg-black px-4 py-2 text-sm font-bold text-white ${cardShadow.replace("rgba(0,0,0,1)", "rgba(236,72,153,1)")} transition-all hover:-translate-y-0.5`}
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-lime-300 py-20 md:py-28">
          {/* Decorative elements */}
          <div className="absolute top-8 right-12 hidden text-6xl md:block" style={{ transform: "rotate(12deg)" }}>🔐</div>
          <div className="absolute bottom-12 left-8 hidden text-5xl md:block" style={{ transform: "rotate(-8deg)" }}>⚡</div>
          <div className="absolute top-1/2 right-1/4 hidden text-4xl md:block" style={{ transform: "rotate(5deg)" }}>🚀</div>

          <div className="mx-auto max-w-5xl px-4">
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.div variants={fadeInUp}>
                <div className={`mb-6 inline-block rounded-lg border-2 border-black bg-white px-3 py-1 text-sm font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]`}>
                  NEW: WebSocket Real-Time Sync
                </div>
              </motion.div>

              <motion.h1
                variants={fadeInUp}
                className="text-5xl font-black leading-tight tracking-tight md:text-7xl lg:text-8xl"
              >
                Stop Leaking
                <br />
                Your{" "}
                <span className="relative inline-block">
                  .env
                  <span className="absolute -bottom-2 left-0 h-4 w-full bg-pink-400/50 -rotate-1" />
                </span>{" "}
                Files
              </motion.h1>

              <motion.p
                variants={fadeInUp}
                className="mt-6 max-w-xl text-lg font-medium text-black/70 md:text-xl"
              >
                Encrypted vault. Role-based access. CLI-first. Stop sharing secrets
                over Slack and start managing them like a real team.
              </motion.p>

              <motion.div variants={fadeInUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/sign-up"
                  className={`rounded-xl bg-black px-8 py-4 text-center text-lg font-black text-white ${cardShadow.replace("rgba(0,0,0,1)", "rgba(236,72,153,1)")} transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(236,72,153,1)]`}
                >
                  Start Free Trial
                </Link>
                <Link
                  href="#features"
                  className={`rounded-xl border-4 border-black bg-white px-8 py-4 text-center text-lg font-black ${cardShadow} transition-all hover:-translate-y-1`}
                >
                  See Features
                </Link>
              </motion.div>

              {/* Fake .env card */}
              <motion.div
                variants={fadeInUp}
                className={`mt-12 max-w-md rounded-xl border-4 border-black bg-white p-5 font-mono text-sm ${cardShadow}`}
                style={{ transform: "rotate(-2deg)" }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="ml-2 text-xs font-bold text-black/50">.env.production</span>
                </div>
                <p><span className="font-bold text-purple-600">DATABASE_URL</span>=<span className="bg-black px-1 text-black">████████████████</span></p>
                <p><span className="font-bold text-purple-600">STRIPE_KEY</span>=<span className="bg-black px-1 text-black">████████████████</span></p>
                <p><span className="font-bold text-purple-600">AWS_SECRET</span>=<span className="bg-black px-1 text-black">████████████████</span></p>
                <p className="mt-2 text-green-600 font-bold">✓ Encrypted by Envpilot</p>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24" style={{ backgroundColor: "#FFFEF5" }}>
          <div className="mx-auto max-w-6xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center">
              <h2 className="text-4xl font-black md:text-5xl">
                Everything You Need
              </h2>
              <p className="mt-3 text-lg font-medium text-black/60">
                Security doesn&apos;t have to be boring.
              </p>
            </motion.div>

            <motion.div
              className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {features.map((f) => (
                <motion.div
                  key={f.title}
                  variants={fadeInUp}
                  className={`rounded-xl ${f.bg} ${cardBase} p-6`}
                >
                  <div className="mb-3 text-4xl">{f.emoji}</div>
                  <h3 className="text-xl font-black">{f.title}</h3>
                  <p className="mt-2 font-medium text-black/70">{f.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="border-t-4 border-black bg-blue-200 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center">
              <h2 className="text-4xl font-black md:text-5xl">How It Works</h2>
            </motion.div>

            <motion.div
              className="mt-16 grid gap-8 md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {[
                { num: "1", title: "Install", desc: "One npm install and you're ready.", color: "bg-pink-400" },
                { num: "2", title: "Login", desc: "Authenticate with your org.", color: "bg-yellow-400" },
                { num: "3", title: "Pull", desc: "Sync variables to your .env.", color: "bg-green-400" },
                { num: "4", title: "Ship", desc: "Push changes to any environment.", color: "bg-purple-400" },
              ].map((step) => (
                <motion.div key={step.num} variants={fadeInUp} className="text-center">
                  <div
                    className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-black ${step.color} text-3xl font-black ${cardShadow}`}
                  >
                    {step.num}
                  </div>
                  <h3 className="mt-4 text-xl font-black">{step.title}</h3>
                  <p className="mt-1 font-medium text-black/70">{step.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Before vs After */}
        <section id="compare" className="border-t-4 border-black py-24" style={{ backgroundColor: "#FFFEF5" }}>
          <div className="mx-auto max-w-5xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center">
              <h2 className="text-4xl font-black md:text-5xl">
                Before vs After
              </h2>
              <p className="mt-3 text-lg font-medium text-black/60">
                The difference is night and day.
              </p>
            </motion.div>

            <motion.div
              className="mt-12 grid gap-6 md:grid-cols-2"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.div variants={fadeInUp} className={`rounded-xl bg-red-200 ${cardBase} p-6`}>
                <h3 className="mb-4 text-xl font-black text-red-700">
                  Without Envpilot 😰
                </h3>
                <ul className="space-y-3">
                  {beforeAfter.before.map((item) => (
                    <li key={item} className="flex items-start gap-2 font-medium">
                      <span className="mt-0.5 text-red-600">✗</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div variants={fadeInUp} className={`rounded-xl bg-green-200 ${cardBase} p-6`}>
                <h3 className="mb-4 text-xl font-black text-green-700">
                  With Envpilot 🎉
                </h3>
                <ul className="space-y-3">
                  {beforeAfter.after.map((item) => (
                    <li key={item} className="flex items-start gap-2 font-medium">
                      <span className="mt-0.5 text-green-600">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Marquee */}
        <section className="overflow-hidden border-t-4 border-b-4 border-black bg-yellow-300 py-4">
          <div className="flex whitespace-nowrap" style={{ animation: "marquee 20s linear infinite" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-8 px-4">
                {["Vercel", "Stripe", "Linear", "Notion", "Figma", "Supabase", "Planetscale", "Railway"].map((co) => (
                  <span key={`${co}-${i}`} className="text-lg font-black text-black/30">
                    {co}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="py-16" style={{ backgroundColor: "#FFFEF5" }}>
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              className="grid grid-cols-2 gap-6 md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {[
                { val: "10M+", label: "Secrets Managed", bg: "bg-pink-300" },
                { val: "5,000+", label: "Teams Using", bg: "bg-blue-300" },
                { val: "99.99%", label: "Uptime SLA", bg: "bg-green-300" },
                { val: "SOC2", label: "Compliant", bg: "bg-purple-300" },
              ].map((s) => (
                <motion.div
                  key={s.label}
                  variants={fadeInUp}
                  className={`rounded-xl ${s.bg} ${cardBase} p-4 text-center`}
                >
                  <p className="text-3xl font-black">{s.val}</p>
                  <p className="mt-1 text-sm font-bold text-black/60">{s.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t-4 border-black bg-pink-400 py-24">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp}>
              <h2 className="text-4xl font-black md:text-5xl">
                Ready to Stop the Chaos?
              </h2>
              <p className="mt-4 text-lg font-medium text-black/70">
                Get started for free. No credit card. No BS.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/sign-up"
                  className={`rounded-xl bg-black px-10 py-4 text-lg font-black text-white ${cardShadow.replace("rgba(0,0,0,1)", "rgba(255,255,255,1)")} transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)]`}
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/sign-in"
                  className={`rounded-xl border-4 border-black bg-white px-10 py-4 text-lg font-black ${cardShadow} transition-all hover:-translate-y-1`}
                >
                  Sign In
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-4 border-black bg-black py-12 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="text-xl font-black">envpilot 🔑</span>
              <p className="mt-4 text-sm text-white/60">
                Secure env management for teams that ship fast.
              </p>
            </div>
            {[
              { title: "Product", links: ["Features", "Pricing", "Changelog"] },
              { title: "Resources", links: ["Docs", "API", "Status"] },
              { title: "Company", links: ["About", "Blog", "Contact"] },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="font-black">{col.title}</h4>
                <ul className="mt-4 space-y-2">
                  {col.links.map((link) => (
                    <li key={link}>
                      <Link href={`/${link.toLowerCase()}`} className="text-sm text-white/60 hover:text-white">
                        {link}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 border-t border-white/20 pt-8 text-center text-sm text-white/40">
            &copy; {new Date().getFullYear()} Envpilot. All rights reserved. Built with vibes.
          </div>
        </div>
      </footer>
    </div>
  );
}
