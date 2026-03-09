"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

function GlassCard({
  children,
  className = "",
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <motion.div
      className={`rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl ${hover ? "transition-all duration-300 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_8px_40px_rgba(139,92,246,0.15)]" : ""} ${className}`}
      variants={fadeInUp}
    >
      {children}
    </motion.div>
  );
}

function FloatingOrb({
  size,
  color,
  top,
  left,
  delay = 0,
}: {
  size: string;
  color: string;
  top: string;
  left: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={`absolute rounded-full blur-3xl ${size} ${color}`}
      style={{ top, left }}
      animate={{ y: [0, -30, 0], x: [0, 15, 0], scale: [1, 1.1, 1] }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  );
}

export default function GlassmorphismLanding() {
  const features = [
    {
      title: "End-to-End Encryption",
      desc: "AES-256 encryption via WorkOS Vault. Your secrets are secure even from us.",
      gradient: "from-blue-500 to-cyan-400",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      ),
    },
    {
      title: "SSO & Multi-Org",
      desc: "Enterprise authentication with SAML, OIDC, and multi-organization workspaces.",
      gradient: "from-purple-500 to-pink-400",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
      ),
    },
    {
      title: "Role-Based Access",
      desc: "Granular per-variable permissions. Admin, Team Lead, and Member roles.",
      gradient: "from-emerald-500 to-teal-400",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
        </svg>
      ),
    },
    {
      title: "IDE Extensions",
      desc: "VS Code and Cursor extensions sync variables directly to your local .env files.",
      gradient: "from-orange-500 to-amber-400",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      ),
    },
    {
      title: "CLI Tool",
      desc: "Pull, push, and manage variables from your terminal. CI/CD pipeline ready.",
      gradient: "from-violet-500 to-purple-400",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      ),
    },
    {
      title: "Audit Logging",
      desc: "Complete access trail. Who viewed what, when. SOC2-ready compliance exports.",
      gradient: "from-rose-500 to-pink-400",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      ),
    },
  ];

  const steps = [
    { num: "01", title: "Connect Your Repo", desc: "Link your GitHub, GitLab, or Bitbucket repository in one click." },
    { num: "02", title: "Define Variables", desc: "Set variables per environment — development, staging, production." },
    { num: "03", title: "Invite Your Team", desc: "Add team members with granular per-variable permissions." },
    { num: "04", title: "Sync Everywhere", desc: "CLI, VS Code extension, and CI/CD — always in sync." },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      {/* Background orbs */}
      <FloatingOrb size="h-96 w-96" color="bg-purple-600/20" top="5%" left="10%" delay={0} />
      <FloatingOrb size="h-80 w-80" color="bg-blue-600/20" top="20%" left="60%" delay={2} />
      <FloatingOrb size="h-72 w-72" color="bg-teal-500/15" top="50%" left="30%" delay={4} />
      <FloatingOrb size="h-64 w-64" color="bg-pink-500/15" top="70%" left="70%" delay={1} />
      <FloatingOrb size="h-96 w-96" color="bg-indigo-600/15" top="85%" left="5%" delay={3} />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <span className="text-lg font-semibold">Envpilot</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {["Features", "How It Works", "Pricing"].map((item) => (
              <Link
                key={item}
                href={`#${item.toLowerCase().replace(/ /g, "-")}`}
                className="text-sm text-white/50 transition-colors hover:text-white"
              >
                {item}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm text-white/50 transition-colors hover:text-white">
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-gradient-to-r from-purple-500 to-blue-500 px-5 py-2 text-sm font-medium transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-16">
        {/* Hero */}
        <section className="flex min-h-[90vh] items-center py-20">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.div
                variants={fadeInUp}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm backdrop-blur-md"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />
                <span className="text-white/70">Now with Enterprise SSO</span>
              </motion.div>

              <motion.h1
                variants={fadeInUp}
                className="mx-auto max-w-4xl text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl"
              >
                Your Secrets Deserve{" "}
                <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-teal-400 bg-clip-text text-transparent">
                  Better Protection
                </span>
              </motion.h1>

              <motion.p
                variants={fadeInUp}
                className="mx-auto mt-6 max-w-2xl text-lg text-white/50 md:text-xl"
              >
                Stop sharing API keys over Slack. Envpilot encrypts, manages, and
                syncs your environment variables across every team and environment.
              </motion.p>

              <motion.div
                variants={fadeInUp}
                className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
              >
                <Link
                  href="/sign-up"
                  className="group flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 px-8 text-sm font-medium transition-all hover:shadow-[0_0_30px_rgba(139,92,246,0.4)]"
                >
                  Start Free Trial
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="#features"
                  className="flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 text-sm text-white/70 backdrop-blur-md transition-all hover:bg-white/10"
                >
                  Learn More
                </Link>
              </motion.div>

              {/* Trusted by */}
              <motion.div variants={fadeInUp} className="mt-20 flex flex-wrap items-center justify-center gap-8">
                <span className="text-xs font-medium uppercase tracking-widest text-white/30">
                  Trusted by
                </span>
                {["Vercel", "Stripe", "Linear", "Notion", "Figma"].map((co) => (
                  <span key={co} className="text-sm font-semibold text-white/20">{co}</span>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24">
          <div className="mx-auto max-w-6xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center">
              <h2 className="text-3xl font-bold md:text-4xl">
                Everything you need for{" "}
                <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  secrets management
                </span>
              </h2>
              <p className="mt-4 text-white/50">Enterprise-grade security, developer-friendly experience.</p>
            </motion.div>

            <motion.div
              className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {features.map((f) => (
                <GlassCard key={f.title}>
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.gradient} text-white shadow-lg`}>
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{f.desc}</p>
                </GlassCard>
              ))}
            </motion.div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24">
          <div className="mx-auto max-w-6xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center">
              <h2 className="text-3xl font-bold md:text-4xl">
                Get started in{" "}
                <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
                  four simple steps
                </span>
              </h2>
            </motion.div>

            <motion.div
              className="mt-16 grid gap-8 md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {steps.map((step, i) => (
                <motion.div key={step.num} variants={fadeInUp} className="relative">
                  {i < 3 && (
                    <div className="absolute top-8 left-[calc(50%+2rem)] hidden h-px w-full bg-gradient-to-r from-purple-500/50 to-transparent md:block" />
                  )}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-xl">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-2xl font-bold text-purple-400">
                      {step.num}
                    </div>
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm text-white/50">{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center">
              <h2 className="text-3xl font-bold md:text-4xl">Simple, transparent pricing</h2>
              <p className="mt-4 text-white/50">Start free. Scale as you grow.</p>
            </motion.div>

            <motion.div
              className="mt-16 grid gap-6 md:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {[
                {
                  name: "Free",
                  price: "$0",
                  desc: "For side projects",
                  features: ["3 projects", "5 team members", "1,000 secrets", "Community support"],
                  cta: "Get Started",
                  highlight: false,
                },
                {
                  name: "Pro",
                  price: "$29",
                  desc: "For growing teams",
                  features: ["Unlimited projects", "25 team members", "50,000 secrets", "Priority support", "Audit logs", "SSO"],
                  cta: "Start Trial",
                  highlight: true,
                },
                {
                  name: "Enterprise",
                  price: "Custom",
                  desc: "For large organizations",
                  features: ["Unlimited everything", "SAML/OIDC SSO", "Dedicated support", "SLA guarantee", "Custom integrations", "SOC2 reports"],
                  cta: "Contact Sales",
                  highlight: false,
                },
              ].map((plan) => (
                <motion.div key={plan.name} variants={fadeInUp}>
                  <div
                    className={`rounded-2xl border p-8 backdrop-blur-xl ${
                      plan.highlight
                        ? "border-purple-500/50 bg-purple-500/10 shadow-[0_0_40px_rgba(139,92,246,0.15)]"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      {plan.price !== "Custom" && <span className="text-white/50">/mo</span>}
                    </div>
                    <p className="mt-2 text-sm text-white/50">{plan.desc}</p>
                    <ul className="mt-6 space-y-3">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-white/70">
                          <svg className="h-4 w-4 shrink-0 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/sign-up"
                      className={`mt-8 block rounded-full py-3 text-center text-sm font-medium transition-all ${
                        plan.highlight
                          ? "bg-gradient-to-r from-purple-500 to-blue-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                          : "border border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              className="grid grid-cols-2 gap-8 rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {[
                { val: "10M+", label: "Secrets Managed" },
                { val: "5,000+", label: "Teams" },
                { val: "99.99%", label: "Uptime" },
                { val: "SOC2", label: "Compliant" },
              ].map((s) => (
                <motion.div key={s.label} variants={fadeInUp} className="text-center">
                  <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                    {s.val}
                  </p>
                  <p className="mt-1 text-sm text-white/40">{s.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-purple-500/10 to-blue-500/5 p-12 backdrop-blur-xl">
                <h2 className="text-3xl font-bold md:text-4xl">
                  Ready to protect your secrets?
                </h2>
                <p className="mt-4 text-white/50">
                  Get started for free. No credit card required.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link
                    href="/sign-up"
                    className="flex h-12 items-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500 px-8 text-sm font-medium transition-all hover:shadow-[0_0_30px_rgba(139,92,246,0.4)]"
                  >
                    Start Your Free Trial
                  </Link>
                  <Link
                    href="/sign-in"
                    className="flex h-12 items-center rounded-full border border-white/20 bg-white/5 px-8 text-sm text-white/70 backdrop-blur-md transition-all hover:bg-white/10"
                  >
                    Contact Sales
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <span className="font-semibold">Envpilot</span>
              </Link>
              <p className="mt-4 text-sm text-white/40">
                Secure environment variable management for modern teams.
              </p>
            </div>
            {[
              { title: "Product", links: ["Features", "Pricing", "Changelog", "Wishlist"] },
              { title: "Resources", links: ["Documentation", "API Reference", "Status", "Blog"] },
              { title: "Company", links: ["About", "Careers", "Contact", "Privacy"] },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="text-sm font-semibold text-white/70">{col.title}</h4>
                <ul className="mt-4 space-y-2">
                  {col.links.map((link) => (
                    <li key={link}>
                      <Link href={`/${link.toLowerCase().replace(/ /g, "-")}`} className="text-sm text-white/40 transition-colors hover:text-white/70">
                        {link}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
            <p className="text-sm text-white/30">&copy; {new Date().getFullYear()} Envpilot. All rights reserved.</p>
            <div className="flex gap-4">
              <Link href="/privacy" className="text-sm text-white/30 hover:text-white/50">Privacy</Link>
              <Link href="/terms" className="text-sm text-white/30 hover:text-white/50">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
