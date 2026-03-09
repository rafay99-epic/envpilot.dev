"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.15 } },
};

export default function SwissMinimalLanding() {
  const capabilities = [
    {
      num: "01",
      title: "Security",
      desc: "Every secret is encrypted at rest using AES-256 via WorkOS Vault. Zero-knowledge architecture means even we cannot read your data. Your keys are yours alone.",
    },
    {
      num: "02",
      title: "Access Control",
      desc: "Three-tier RBAC with per-variable granularity. Admins define the boundaries. Team leads manage access. Members operate within their scope. No ambiguity.",
    },
    {
      num: "03",
      title: "Integration",
      desc: "CLI for your terminal. Extensions for VS Code and Cursor. API for your CI/CD pipeline. One source of truth, accessible from every surface of your workflow.",
    },
    {
      num: "04",
      title: "Compliance",
      desc: "Complete audit trail for every read, write, and permission change. SOC2-ready exports. Know exactly who accessed what, when, and from where.",
    },
  ];

  const features = [
    { title: "AES-256 Encryption", desc: "Military-grade encryption at rest and in transit" },
    { title: "SAML & OIDC SSO", desc: "Enterprise authentication for your organization" },
    { title: "Per-Variable ACLs", desc: "Granular permissions down to individual secrets" },
    { title: "VS Code Extension", desc: "Real-time .env sync without leaving your editor" },
    { title: "CLI Pipeline", desc: "Pull, push, diff from terminal and CI/CD systems" },
    { title: "Audit Exports", desc: "Complete access logs for compliance requirements" },
  ];

  const steps = [
    { num: "01", title: "Install", desc: "One command to add the CLI or extension" },
    { num: "02", title: "Authenticate", desc: "SSO login with your organization" },
    { num: "03", title: "Define", desc: "Set variables per environment" },
    { num: "04", title: "Sync", desc: "Pull to local, push to team" },
  ];

  return (
    <div className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-sm dark:border-zinc-800 dark:bg-black/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-sm font-light tracking-[0.3em] uppercase">
            envpilot
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {["Features", "Process", "Security"].map((item) => (
              <Link
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-xs font-light uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-black dark:hover:text-white"
              >
                {item}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-6">
            <Link href="/sign-in" className="text-xs font-light uppercase tracking-[0.2em] text-zinc-500 hover:text-black dark:hover:text-white">
              Sign In
            </Link>
            <Link href="/sign-up" className="text-xs font-light uppercase tracking-[0.2em] text-red-600 hover:text-red-700">
              Get Started &rarr;
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-14">
        {/* Hero */}
        <section className="flex min-h-[85vh] items-center py-32 md:py-40">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.h1
                variants={fadeIn}
                className="text-6xl font-extralight leading-[1.1] tracking-tight md:text-8xl lg:text-9xl"
              >
                Manage secrets
                <span className="text-red-600">.</span>
                <br />
                Not chaos
                <span className="text-red-600">.</span>
              </motion.h1>

              <motion.div variants={fadeIn} className="mt-2 h-px w-16 bg-red-600" />

              <motion.p
                variants={fadeIn}
                className="mt-8 max-w-md text-sm font-light leading-relaxed text-zinc-500"
              >
                Encrypted storage, role-based access, and seamless integrations
                for environment variables. Built for teams that value clarity.
              </motion.p>

              <motion.div variants={fadeIn}>
                <Link
                  href="/sign-up"
                  className="mt-8 inline-block text-sm font-light uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-red-600"
                >
                  Get started &rarr;
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Grid Capabilities */}
        <section id="security" className="border-t border-zinc-200 py-24 dark:border-zinc-800">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {capabilities.map((cap, i) => (
                <motion.div
                  key={cap.num}
                  variants={fadeIn}
                  className={`grid gap-8 py-16 md:grid-cols-12 ${i > 0 ? "border-t border-zinc-100 dark:border-zinc-900" : ""}`}
                >
                  <div className="md:col-span-4">
                    <span className="text-6xl font-extralight text-zinc-200 dark:text-zinc-800">
                      {cap.num}
                    </span>
                    <h3 className="mt-2 text-lg font-light tracking-tight">
                      {cap.title}
                    </h3>
                  </div>
                  <div className="md:col-span-8">
                    <p className="max-w-lg text-sm font-light leading-relaxed text-zinc-500">
                      {cap.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-zinc-200 py-24 dark:border-zinc-800">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              className="grid gap-x-16 gap-y-12 md:grid-cols-2"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {features.map((f) => (
                <motion.div key={f.title} variants={fadeIn}>
                  <div className="flex items-start gap-3">
                    <span className="mt-1 block h-px w-4 bg-red-600 shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium tracking-tight">
                        {f.title}
                      </h4>
                      <p className="mt-1 text-sm font-light text-zinc-500">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Process */}
        <section id="process" className="border-t border-zinc-200 bg-zinc-50 py-24 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <h2 className="text-xs font-light uppercase tracking-[0.3em] text-zinc-400">
                Process
              </h2>
            </motion.div>

            <motion.div
              className="mt-16 grid gap-12 md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {steps.map((step) => (
                <motion.div key={step.num} variants={fadeIn}>
                  <span className="text-5xl font-extralight text-zinc-300 dark:text-zinc-700">
                    {step.num}
                  </span>
                  <h3 className="mt-4 text-sm font-medium tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-xs font-light leading-relaxed text-zinc-500">
                    {step.desc}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Quote */}
        <section className="border-t border-zinc-200 py-32 dark:border-zinc-800">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <p className="text-2xl font-extralight italic leading-relaxed tracking-tight text-zinc-600 dark:text-zinc-400 md:text-3xl">
                &ldquo;The best security is the kind you don&apos;t have to think about.&rdquo;
              </p>
              <p className="mt-6 text-xs font-light uppercase tracking-[0.3em] text-zinc-400">
                Design Philosophy
              </p>
            </motion.div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-t border-zinc-200 py-24 dark:border-zinc-800">
          <div className="mx-auto max-w-5xl px-6">
            <motion.div
              className="flex flex-col items-center justify-between gap-12 md:flex-row"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {[
                { val: "10M+", label: "SECRETS MANAGED" },
                { val: "5,000+", label: "TEAMS" },
                { val: "99.99%", label: "UPTIME" },
                { val: "SOC2", label: "COMPLIANT" },
              ].map((s, i) => (
                <motion.div key={s.label} variants={fadeIn} className="flex items-center gap-12">
                  <div className="text-center">
                    <p className="text-5xl font-extralight tracking-tight md:text-6xl">
                      {s.val}
                    </p>
                    <p className="mt-2 text-[10px] font-light uppercase tracking-[0.3em] text-zinc-400">
                      {s.label}
                    </p>
                  </div>
                  {i < 3 && (
                    <div className="hidden h-16 w-px bg-zinc-200 dark:bg-zinc-800 md:block" />
                  )}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-zinc-200 py-32 dark:border-zinc-800">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <h2 className="text-4xl font-extralight tracking-tight md:text-5xl">
                Start securing your
                <br />
                variables today
                <span className="text-red-600">.</span>
              </h2>
              <div className="mt-2 h-px w-16 bg-red-600" />
              <Link
                href="/sign-up"
                className="mt-8 inline-block text-sm font-light uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-red-600"
              >
                Get started &rarr;
              </Link>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-12 dark:border-zinc-800">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div>
              <span className="text-xs font-light uppercase tracking-[0.3em] text-zinc-400">
                envpilot
              </span>
              <p className="mt-2 text-xs font-light text-zinc-400">
                &copy; {new Date().getFullYear()}
              </p>
            </div>
            <div className="flex gap-8">
              {["Privacy", "Terms", "Changelog", "Status"].map((link) => (
                <Link
                  key={link}
                  href={`/${link.toLowerCase()}`}
                  className="text-xs font-light uppercase tracking-[0.15em] text-zinc-400 transition-colors hover:text-black dark:hover:text-white"
                >
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
