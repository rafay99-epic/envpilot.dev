"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  Shield,
  Users,
  Terminal,
  Monitor,
  Puzzle,
  Lock,
  Eye,
  ArrowDown,
  Check,
  ChevronRight,
  FileText,
  AlertTriangle,
  ShieldCheck,
  UserCheck,
  UserCog,
  User,
} from "lucide-react";

const fadeIn = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" as const },
  },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

function Chapter({
  number,
  title,
  children,
  bg = "bg-zinc-950",
}: {
  number: string;
  title: string;
  children: React.ReactNode;
  bg?: string;
}) {
  return (
    <section className={`relative min-h-screen ${bg} py-24 md:py-32`}>
      <div className="mx-auto max-w-4xl px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
        >
          <motion.div variants={fadeIn} className="mb-8">
            <span className="text-xs font-medium uppercase tracking-[0.3em] text-rose-500">
              Chapter {number}
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
              {title}
            </h2>
          </motion.div>
          {children}
        </motion.div>
      </div>
    </section>
  );
}

export default function StorytellingLanding() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.8], [0, -60]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="text-sm font-semibold text-white">
            envpilot
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="#chapter-1"
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              Story
            </Link>
            <Link
              href="#pricing"
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/docs"
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              Docs
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-rose-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-rose-600 transition-colors"
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      {/* Prologue / Hero */}
      <section
        ref={heroRef}
        className="relative flex min-h-screen items-center overflow-hidden"
      >
        <motion.div
          className="relative z-10 mx-auto max-w-4xl px-6 text-center"
          style={{ opacity: heroOpacity, y: heroY }}
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="text-sm font-medium text-rose-400"
          >
            A story about every development team
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
            className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl lg:text-7xl"
          >
            It&apos;s 3 AM.
            <br />
            Your <span className="text-rose-400">.env</span> just leaked.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="mx-auto mt-6 max-w-xl text-lg text-zinc-500"
          >
            Someone pushed production credentials to a public repo. Your Slack
            is blowing up. Your CTO is calling. This is the story of how it
            never has to happen again.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-10"
          >
            <Link
              href="#chapter-1"
              className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors"
            >
              Scroll to begin
              <ArrowDown className="h-4 w-4 animate-bounce" />
            </Link>
          </motion.div>
        </motion.div>

        {/* Gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 via-transparent to-transparent" />
      </section>

      {/* Chapter 1: The Problem */}
      <div id="chapter-1">
        <Chapter number="01" title="The chaos before">
          <motion.div
            variants={fadeIn}
            className="space-y-6 text-lg leading-relaxed text-zinc-400"
          >
            <p>
              Every team starts the same way. A new developer joins and asks:
              <span className="italic text-zinc-300">
                {" "}
                &ldquo;Can someone send me the env vars?&rdquo;
              </span>
            </p>
            <p>
              What follows is a Slack DM with a .env file. Unencrypted.
              Unsanitized. Sitting in a message history that anyone with access
              can search.
            </p>
          </motion.div>

          <motion.div variants={fadeIn} className="mt-12 space-y-3">
            {[
              {
                who: "Alice (new dev)",
                msg: "Hey, can someone send me the production env vars?",
                time: "9:14 AM",
              },
              { who: "Bob (lead)", msg: "Sure, here you go:", time: "9:16 AM" },
              {
                who: "Bob (lead)",
                msg: "DATABASE_URL=postgres://admin:realpassword@prod-db.aws.com:5432/app\nSTRIPE_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc\nAWS_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCY",
                time: "9:16 AM",
                danger: true,
              },
              {
                who: "Alice (new dev)",
                msg: "Got it, thanks!",
                time: "9:17 AM",
              },
            ].map((msg, i) => (
              <motion.div
                key={i}
                variants={fadeIn}
                className={`max-w-lg rounded-xl border px-4 py-3 ${
                  msg.danger
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-zinc-800 bg-zinc-900/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">
                    {msg.who}
                  </span>
                  <span className="text-[10px] text-zinc-600">{msg.time}</span>
                </div>
                <p
                  className={`mt-1 whitespace-pre-line font-mono text-xs ${msg.danger ? "text-red-400" : "text-zinc-500"}`}
                >
                  {msg.msg}
                </p>
                {msg.danger && (
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    These credentials are now in Slack&apos;s message history
                    forever.
                  </p>
                )}
              </motion.div>
            ))}
          </motion.div>
        </Chapter>
      </div>

      {/* Chapter 2: The Turning Point */}
      <Chapter
        number="02"
        title="What if there was a better way?"
        bg="bg-black"
      >
        <motion.div
          variants={fadeIn}
          className="space-y-6 text-lg leading-relaxed text-zinc-400"
        >
          <p>
            Imagine a world where secrets never leave an encrypted vault. Where
            access is granted per-variable, per-person, with an expiration date.
            Where every read, write, and share is logged.
          </p>
          <p>
            That world is{" "}
            <span className="font-semibold text-white">Envpilot</span>.
          </p>
        </motion.div>

        <motion.div
          variants={fadeIn}
          className="mt-12 grid gap-6 md:grid-cols-3"
        >
          {[
            {
              icon: <Lock className="h-5 w-5 text-emerald-400" />,
              title: "Encrypted Vault",
              desc: "AES-256 encryption via WorkOS Vault. Zero-knowledge — we can't read your secrets either.",
            },
            {
              icon: <ShieldCheck className="h-5 w-5 text-blue-400" />,
              title: "Per-Variable Access",
              desc: "Grant read or write access to specific variables. Set expiration dates. Revoke instantly.",
            },
            {
              icon: <Eye className="h-5 w-5 text-amber-400" />,
              title: "Full Audit Trail",
              desc: "40+ action types. IP tracking. Geographic location. SOC 2-ready exports.",
            },
          ].map((item) => (
            <motion.div
              key={item.title}
              variants={fadeIn}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800">
                {item.icon}
              </div>
              <h3 className="mt-3 font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-zinc-500">{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </Chapter>

      {/* Chapter 3: The Solution */}
      <Chapter number="03" title="One command. Every secret.">
        <motion.div
          variants={fadeIn}
          className="space-y-6 text-lg leading-relaxed text-zinc-400"
        >
          <p>
            Your new developer&apos;s first day now looks very different. No
            Slack DMs. No shared documents. No secrets in plain text.
          </p>
        </motion.div>

        <motion.div variants={fadeIn} className="mt-10 space-y-4">
          {[
            {
              step: "1",
              cmd: "npm install -g @envpilot/cli",
              output: "added 1 package in 2.1s",
              note: "Install the CLI",
            },
            {
              step: "2",
              cmd: "envpilot login",
              output: "✓ Authenticated as alice@company.com",
              note: "Browser-based SSO login",
            },
            {
              step: "3",
              cmd: "envpilot init",
              output: "✓ Linked to project: backend-api (development)",
              note: "Pick your project and environment",
            },
            {
              step: "4",
              cmd: "envpilot pull",
              output: "✓ Synced 23 variables to .env",
              note: "Done. All variables synced securely.",
            },
          ].map((s) => (
            <motion.div key={s.step} variants={fadeIn} className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-sm font-bold text-rose-400">
                {s.step}
              </div>
              <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                <p className="text-xs text-zinc-500">{s.note}</p>
                <div className="mt-2 font-mono text-sm">
                  <p>
                    <span className="text-emerald-400">$</span>{" "}
                    <span className="text-zinc-300">{s.cmd}</span>
                  </p>
                  <p className="text-emerald-400/70">{s.output}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Chapter>

      {/* Chapter 4: The Tools */}
      <Chapter number="04" title="Wherever you work" bg="bg-black">
        <motion.div
          variants={fadeIn}
          className="space-y-6 text-lg leading-relaxed text-zinc-400"
        >
          <p>
            Envpilot meets you where you are. Terminal, IDE, or browser — your
            secrets stay encrypted and in sync.
          </p>
        </motion.div>

        <motion.div
          variants={fadeIn}
          className="mt-12 grid gap-6 md:grid-cols-2"
        >
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-emerald-400" />
              <h3 className="font-semibold text-white">CLI Tool</h3>
            </div>
            <p className="mt-3 text-sm text-zinc-500">
              Pull, push, list, init, and switch from your terminal. Preview
              changes with{" "}
              <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-400">
                --dry-run
              </code>
              . Members auto-submit requests instead of creating directly.
            </p>
            <div className="mt-4 space-y-1 font-mono text-xs text-zinc-600">
              <p>
                <span className="text-emerald-400">$</span> envpilot pull --env
                production
              </p>
              <p>
                <span className="text-emerald-400">$</span> envpilot push
                --dry-run
              </p>
              <p>
                <span className="text-emerald-400">$</span> envpilot list
                variables --show-values
              </p>
              <p>
                <span className="text-emerald-400">$</span> envpilot switch
                staging
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
            <div className="flex items-center gap-2">
              <Puzzle className="h-5 w-5 text-blue-400" />
              <h3 className="font-semibold text-white">VS Code Extension</h3>
            </div>
            <p className="mt-3 text-sm text-zinc-500">
              Real-time sync via WebSocket. Link multiple directories to
              different environments. Automatic file cleanup when access is
              revoked.
            </p>
            <div className="mt-4 space-y-1 text-xs text-zinc-600">
              <p className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3 text-blue-400" />
                apps/api/.env &larr; production
              </p>
              <p className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3 text-blue-400" />
                apps/web/.env.local &larr; development
              </p>
              <p className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3 text-blue-400" />
                packages/sdk/.env &larr; staging
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 md:col-span-2">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-purple-400" />
              <h3 className="font-semibold text-white">Web Dashboard</h3>
            </div>
            <p className="mt-3 text-sm text-zinc-500">
              Manage everything from the browser: projects, variables, team
              members, and audit logs. Approve member requests. Export
              compliance reports. Track version history and rollback.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                "Projects & Environments",
                "Variables & Secrets",
                "Team Management",
                "Audit Logs",
                "Version History",
                "Settings & Integrations",
              ].map((item) => (
                <p
                  key={item}
                  className="flex items-center gap-1.5 text-xs text-zinc-600"
                >
                  <ChevronRight className="h-3 w-3 shrink-0 text-purple-400" />
                  {item}
                </p>
              ))}
            </div>
          </div>
        </motion.div>
      </Chapter>

      {/* Chapter 5: The Governance */}
      <Chapter number="05" title="Trust, but verify">
        <motion.div
          variants={fadeIn}
          className="space-y-6 text-lg leading-relaxed text-zinc-400"
        >
          <p>
            The real power isn&apos;t just encryption — it&apos;s control. Know
            exactly who has access to what. Set it. Audit it. Revoke it.
          </p>
        </motion.div>

        <motion.div
          variants={fadeIn}
          className="mt-12 grid gap-4 md:grid-cols-3"
        >
          {[
            {
              icon: <UserCog className="h-5 w-5 text-rose-400" />,
              title: "Admin",
              items: [
                "Full access to everything",
                "Rollback variable versions",
                "Manage all permissions",
                "Export audit logs",
              ],
            },
            {
              icon: <UserCheck className="h-5 w-5 text-amber-400" />,
              title: "Team Lead",
              items: [
                "Create and manage projects",
                "Grant per-variable access",
                "Approve member requests",
                "View audit logs",
              ],
            },
            {
              icon: <User className="h-5 w-5 text-blue-400" />,
              title: "Member",
              items: [
                "Read-only project view",
                "Request variable access",
                "Submit new variables for approval",
                "Pull approved secrets",
              ],
            },
          ].map((role) => (
            <motion.div
              key={role.title}
              variants={fadeIn}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5"
            >
              <div className="flex items-center gap-2">
                {role.icon}
                <h4 className="font-semibold text-white">{role.title}</h4>
              </div>
              <ul className="mt-3 space-y-2">
                {role.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-zinc-500"
                  >
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>
      </Chapter>

      {/* Chapter 6: Pricing */}
      <div id="pricing">
        <Chapter number="06" title="Fair, simple pricing" bg="bg-black">
          <motion.div
            variants={fadeIn}
            className="space-y-6 text-lg leading-relaxed text-zinc-400"
          >
            <p>
              We believe security tooling shouldn&apos;t be gated behind
              enterprise contracts. Envpilot is free during early access — no
              credit card, no strings attached.
            </p>
          </motion.div>

          <motion.div
            variants={fadeIn}
            className="mt-12 grid gap-6 md:grid-cols-2"
          >
            {/* Free Plan */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Free</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/5 px-2.5 py-0.5 text-[10px] font-medium text-rose-400">
                  <span className="h-1 w-1 rounded-full bg-rose-400" />
                  Alpha
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-sm text-zinc-600">/ mo / org</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Free during early access. Everything included.
              </p>
              <div className="mt-6 space-y-2.5">
                {[
                  "Unlimited projects & environments",
                  "Unlimited variables",
                  "Unlimited team members",
                  "CLI + VS Code Extension",
                  "Web Dashboard",
                  "AES-256 encrypted vault",
                  "Role-based access control",
                  "Full audit logging",
                ].map((item) => (
                  <p
                    key={item}
                    className="flex items-center gap-2 text-sm text-zinc-400"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    {item}
                  </p>
                ))}
              </div>
              <Link
                href="/sign-up"
                className="mt-6 block rounded-full bg-rose-500 py-2.5 text-center text-sm font-medium text-white hover:bg-rose-600 transition-colors"
              >
                Get Started Free
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 opacity-70">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Pro</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/50 px-2.5 py-0.5 text-[10px] font-medium text-zinc-500">
                  <span className="h-1 w-1 rounded-full bg-zinc-500" />
                  Coming soon
                </span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-zinc-400">$10</span>
                <span className="text-sm text-zinc-600">/ mo / org</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                For teams that need more. Launching soon.
              </p>
              <div className="mt-6 space-y-2.5">
                {[
                  "Everything in Free",
                  "Priority support",
                  "Advanced audit exports",
                  "Custom integrations",
                  "SSO / SAML support",
                  "SLA guarantees",
                ].map((item) => (
                  <p
                    key={item}
                    className="flex items-center gap-2 text-sm text-zinc-500"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
                    {item}
                  </p>
                ))}
              </div>
              <span className="mt-6 block cursor-not-allowed rounded-full border border-zinc-800 py-2.5 text-center text-sm text-zinc-600">
                Coming Soon
              </span>
            </div>
          </motion.div>
        </Chapter>
      </div>

      {/* Epilogue: CTA */}
      <section className="relative flex min-h-[60vh] items-center bg-gradient-to-b from-zinc-950 to-black py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.p
              variants={fadeIn}
              className="text-xs font-medium uppercase tracking-[0.3em] text-rose-500"
            >
              Epilogue
            </motion.p>
            <motion.h2
              variants={fadeIn}
              className="mt-4 text-3xl font-semibold text-white md:text-5xl"
            >
              Write a different ending.
            </motion.h2>
            <motion.p variants={fadeIn} className="mt-4 text-lg text-zinc-500">
              Free to start. Your secrets deserve better than Slack.
            </motion.p>
            <motion.div
              variants={fadeIn}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link
                href="/sign-up"
                className="rounded-full bg-rose-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
              >
                Start Free
              </Link>
              <Link
                href="/docs"
                className="flex items-center gap-1.5 rounded-full border border-zinc-800 px-6 py-2.5 text-sm text-zinc-400 hover:border-zinc-700 transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                Read the Docs
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 bg-black py-8">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="text-xs text-zinc-600">
              &copy; {new Date().getFullYear()} Envpilot
            </span>
            <div className="flex gap-6">
              {[
                { label: "Docs", href: "/docs" },
                { label: "Changelog", href: "/changelog" },
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
              ].map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
