"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  Shield,
  Users,
  Terminal,
  Monitor,
  Puzzle,
  FileText,
  Lock,
  Eye,
  ArrowRight,
  Check,
  ChevronRight,
} from "lucide-react";

const COMMANDS = [
  "envpilot pull --env production",
  "envpilot push --env staging --dry-run",
  "envpilot list variables --show-values",
  "envpilot init --environment development",
  "envpilot switch production",
];

function useTypingEffect(texts: string[], typingSpeed = 60, pauseTime = 2000) {
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = texts[textIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeleting && charIndex < current.length) {
      timeout = setTimeout(() => setCharIndex((c) => c + 1), typingSpeed);
    } else if (!isDeleting && charIndex === current.length) {
      timeout = setTimeout(() => setIsDeleting(true), pauseTime);
    } else if (isDeleting && charIndex > 0) {
      timeout = setTimeout(() => setCharIndex((c) => c - 1), typingSpeed / 2);
    } else if (isDeleting && charIndex === 0) {
      timeout = setTimeout(() => {
        setIsDeleting(false);
        setTextIndex((i) => (i + 1) % texts.length);
      }, 0);
    }

    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, textIndex, texts, typingSpeed, pauseTime]);

  return texts[textIndex].substring(0, charIndex);
}

function TerminalWindow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 shadow-2xl ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
        <div className="h-3 w-3 rounded-full bg-red-500/80" />
        <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
        <div className="h-3 w-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-zinc-500">{title}</span>
      </div>
      <div className="flex-1 p-5 font-mono text-sm leading-relaxed">
        {children}
      </div>
    </div>
  );
}

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function TerminalLanding() {
  const typedCommand = useTypingEffect(COMMANDS);

  const features = [
    {
      icon: <Lock className="h-4 w-4 text-emerald-400" />,
      cmd: "encrypt",
      flag: "--algorithm aes-256-gcm",
      title: "End-to-End Encryption",
      desc: "AES-256 encryption at rest via WorkOS Vault. Zero-knowledge architecture — we never see your secrets.",
    },
    {
      icon: <Users className="h-4 w-4 text-blue-400" />,
      cmd: "acl",
      flag: "--role admin,lead,member",
      title: "Role-Based Access",
      desc: "Three-tier RBAC with per-variable permissions. Members request access; leads and admins approve.",
    },
    {
      icon: <Eye className="h-4 w-4 text-amber-400" />,
      cmd: "audit",
      flag: "--format json --days 90",
      title: "Audit Logging",
      desc: "40+ event types with IP, user agent, and location. Filter, search, and export for SOC 2 compliance.",
    },
    {
      icon: <Terminal className="h-4 w-4 text-green-400" />,
      cmd: "cli",
      flag: "--env production",
      title: "CLI Tool",
      desc: "Pull, push, list, switch, and init from your terminal. Dry-run previews for safe changes. Browser-based SSO.",
    },
    {
      icon: <Puzzle className="h-4 w-4 text-purple-400" />,
      cmd: "sync",
      flag: "--target vscode",
      title: "VS Code Extension",
      desc: "Real-time WebSocket sync. Multi-directory linking. Automatic file cleanup on access revocation.",
    },
    {
      icon: <Monitor className="h-4 w-4 text-rose-400" />,
      cmd: "dashboard",
      flag: "--view projects",
      title: "Web Dashboard",
      desc: "Manage projects, variables, team members, and audit logs. Approve requests. Export compliance reports.",
    },
  ];

  const steps = [
    {
      cmd: "npm install -g @envpilot/cli",
      output: "added 1 package in 2.3s",
      label: "Install",
    },
    {
      cmd: "envpilot login",
      output: "✓ Authenticated as dev@company.com",
      label: "Login",
    },
    {
      cmd: "envpilot init",
      output: "✓ Linked to project: backend-api (development)",
      label: "Init",
    },
    {
      cmd: "envpilot pull --env production",
      output: "✓ Synced 47 variables to .env",
      label: "Pull",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-green-400">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-green-400">$</span>
            <span className="font-bold text-zinc-100">envpilot</span>
            <span className="text-xs text-zinc-600">v1.0</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {[
              { label: "Features", href: "#features" },
              { label: "Workflow", href: "#workflow" },
              { label: "Pricing", href: "#pricing" },
              { label: "Docs", href: "/docs" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-xs text-zinc-500 transition-colors hover:text-green-400"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-xs text-zinc-500 transition-colors hover:text-green-400"
            >
              sign-in
            </Link>
            <Link
              href="/sign-up"
              className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-all hover:bg-green-500/20"
            >
              get-started
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-14">
        {/* Hero */}
        <section className="relative flex min-h-[90vh] items-center overflow-hidden">
          {/* Background grid */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(34,197,94,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,1) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          <div className="relative z-10 mx-auto w-full max-w-5xl px-4 py-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded border border-amber-500/20 bg-amber-500/5 px-3 py-1 text-xs text-amber-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                Now with WebSocket real-time sync
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-zinc-100 md:text-6xl lg:text-7xl">
                Secrets management
                <br />
                <span className="text-green-400">from your terminal.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base text-zinc-500 md:text-lg">
                Stop sharing .env files over Slack. Encrypted storage,
                role-based access, and CLI-first workflow for teams that live in
                the terminal.
              </p>

              {/* Interactive terminal */}
              <TerminalWindow
                title="bash — envpilot"
                className="mt-10 max-w-2xl"
              >
                <div className="flex items-center">
                  <span className="mr-2 text-green-500">$</span>
                  <span className="text-zinc-300">{typedCommand}</span>
                  <span
                    className="ml-0.5 inline-block h-5 w-2 bg-green-400"
                    style={{ animation: "blink 1s step-end infinite" }}
                  />
                </div>
              </TerminalWindow>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/sign-up"
                  className="group inline-flex items-center gap-2 rounded border border-green-500/30 bg-green-500/10 px-6 py-3 text-sm text-green-400 transition-all hover:bg-green-500/20"
                >
                  <span>$</span> npm install -g @envpilot/cli
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="#features"
                  className="inline-flex items-center gap-2 rounded border border-zinc-700 px-6 py-3 text-sm text-zinc-400 transition-all hover:border-zinc-600 hover:text-zinc-300"
                >
                  man envpilot
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-zinc-800/50 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <p className="text-xs uppercase tracking-widest text-green-500">
                {"// features"}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
                Built for the command line
              </h2>
            </motion.div>

            <motion.div
              className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {features.map((feature) => (
                <motion.div
                  key={feature.title}
                  variants={fadeInUp}
                  className="flex"
                >
                  <TerminalWindow title={feature.cmd} className="h-full">
                    <div className="mb-3 flex items-center gap-2">
                      {feature.icon}
                      <span className="text-zinc-300">
                        envpilot {feature.cmd}
                      </span>{" "}
                      <span className="text-amber-400">{feature.flag}</span>
                    </div>
                    <div className="border-t border-zinc-800 pt-3">
                      <p className="text-xs font-bold text-zinc-300">
                        {feature.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                        {feature.desc}
                      </p>
                    </div>
                  </TerminalWindow>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Workflow */}
        <section
          id="workflow"
          className="border-t border-zinc-800/50 bg-zinc-900/30 py-24"
        >
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <p className="text-xs uppercase tracking-widest text-green-500">
                {"// workflow"}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
                Four commands to production
              </h2>
            </motion.div>

            <motion.div
              className="mt-12"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <TerminalWindow title="bash — setup" className="max-w-3xl">
                {steps.map((step, i) => (
                  <motion.div
                    key={step.label}
                    variants={fadeInUp}
                    className={i > 0 ? "mt-4" : ""}
                  >
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 text-zinc-600">
                        [{String(i + 1).padStart(2, "0")}]
                      </span>
                      <div>
                        <div>
                          <span className="text-green-500">$</span>{" "}
                          <span className="text-zinc-300">{step.cmd}</span>
                        </div>
                        <div className="mt-0.5 text-green-400/70">
                          {step.output}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </TerminalWindow>
            </motion.div>
          </div>
        </section>

        {/* Code Demo */}
        <section className="border-t border-zinc-800/50 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <p className="text-xs uppercase tracking-widest text-green-500">
                {"// demo"}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
                Your .env, but secure
              </h2>
            </motion.div>

            <motion.div
              className="mt-12 grid gap-6 md:grid-cols-2"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.div variants={fadeInUp} className="flex">
                <TerminalWindow
                  title="before — .env (shared via Slack)"
                  className="h-full"
                >
                  <div className="space-y-1 text-xs">
                    <p>
                      <span className="text-zinc-500">
                        # DON&apos;T COMMIT THIS!
                      </span>
                    </p>
                    <p>
                      <span className="text-amber-400">DATABASE_URL</span>
                      <span className="text-zinc-600">=</span>
                      <span className="text-red-400">
                        postgres://admin:p@ssw0rd@prod.db:5432
                      </span>
                    </p>
                    <p>
                      <span className="text-amber-400">STRIPE_SECRET</span>
                      <span className="text-zinc-600">=</span>
                      <span className="text-red-400">
                        sk_live_4eC39HqLyjWDarj
                      </span>
                    </p>
                    <p>
                      <span className="text-amber-400">AWS_SECRET_KEY</span>
                      <span className="text-zinc-600">=</span>
                      <span className="text-red-400">
                        wJalrXUtnFEMI/K7MDENG
                      </span>
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-red-400">
                      <Shield className="h-3 w-3" />
                      Leaked in #general 3 months ago
                    </p>
                  </div>
                </TerminalWindow>
              </motion.div>

              <motion.div variants={fadeInUp} className="flex">
                <TerminalWindow
                  title="after — envpilot pull"
                  className="h-full"
                >
                  <div className="space-y-1 text-xs">
                    <p>
                      <span className="text-zinc-500">
                        # Auto-synced by Envpilot
                      </span>
                    </p>
                    <p>
                      <span className="text-amber-400">DATABASE_URL</span>
                      <span className="text-zinc-600">=</span>
                      <span className="text-green-400">
                        vault://ref/db_prod_2847
                      </span>
                    </p>
                    <p>
                      <span className="text-amber-400">STRIPE_SECRET</span>
                      <span className="text-zinc-600">=</span>
                      <span className="text-green-400">
                        vault://ref/stripe_live_9182
                      </span>
                    </p>
                    <p>
                      <span className="text-amber-400">AWS_SECRET_KEY</span>
                      <span className="text-zinc-600">=</span>
                      <span className="text-green-400">
                        vault://ref/aws_key_5521
                      </span>
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-green-400">
                      <Check className="h-3 w-3" />
                      Encrypted, versioned, access-logged
                    </p>
                  </div>
                </TerminalWindow>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Platform */}
        <section className="border-t border-zinc-800/50 bg-zinc-900/30 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <p className="text-xs uppercase tracking-widest text-green-500">
                {"// platform"}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
                Three surfaces, one vault
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-zinc-500">
                Terminal, IDE, or browser — your secrets stay encrypted and in
                sync everywhere.
              </p>
            </motion.div>

            <motion.div
              className="mt-12 grid gap-4 md:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.div variants={fadeInUp} className="flex">
                <TerminalWindow title="cli" className="h-full">
                  <div className="mb-3 flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-green-400" />
                    <span className="text-xs font-bold text-zinc-300">
                      CLI Tool
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-500">
                    <p>
                      <span className="text-green-500">$</span> envpilot login
                    </p>
                    <p>
                      <span className="text-green-500">$</span> envpilot init
                    </p>
                    <p>
                      <span className="text-green-500">$</span> envpilot pull
                      --env production
                    </p>
                    <p>
                      <span className="text-green-500">$</span> envpilot push
                      --dry-run
                    </p>
                    <p>
                      <span className="text-green-500">$</span> envpilot list
                      variables --show-values
                    </p>
                    <p>
                      <span className="text-green-500">$</span> envpilot switch
                      staging
                    </p>
                  </div>
                  <div className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-600">
                    8 commands. Browser-based SSO. Dry-run previews. CI/CD
                    ready.
                  </div>
                </TerminalWindow>
              </motion.div>

              <motion.div variants={fadeInUp} className="flex">
                <TerminalWindow title="vscode" className="h-full">
                  <div className="mb-3 flex items-center gap-2">
                    <Puzzle className="h-4 w-4 text-blue-400" />
                    <span className="text-xs font-bold text-zinc-300">
                      VS Code Extension
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-500">
                    <p>
                      <span className="text-blue-400">&gt;</span> Envpilot: Sign
                      In
                    </p>
                    <p>
                      <span className="text-blue-400">&gt;</span> Envpilot: Link
                      Project
                    </p>
                    <p>
                      <span className="text-blue-400">&gt;</span> Envpilot: Pull
                      Variables
                    </p>
                    <p>
                      <span className="text-blue-400">&gt;</span> Envpilot: Add
                      Directory
                    </p>
                    <p>
                      <span className="text-blue-400">&gt;</span> Envpilot:
                      Select Environments
                    </p>
                    <p>
                      <span className="text-blue-400">&gt;</span> Envpilot:
                      Request Variable
                    </p>
                  </div>
                  <div className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-600">
                    Real-time WebSocket sync. Multi-directory. Auto-cleanup on
                    revoke.
                  </div>
                </TerminalWindow>
              </motion.div>

              <motion.div variants={fadeInUp} className="flex">
                <TerminalWindow title="dashboard" className="h-full">
                  <div className="mb-3 flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-purple-400" />
                    <span className="text-xs font-bold text-zinc-300">
                      Web Dashboard
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-500">
                    <p>
                      <span className="text-purple-400">/</span> Projects &amp;
                      Environments
                    </p>
                    <p>
                      <span className="text-purple-400">/</span> Variables &amp;
                      Secrets
                    </p>
                    <p>
                      <span className="text-purple-400">/</span> Team &amp;
                      Permissions
                    </p>
                    <p>
                      <span className="text-purple-400">/</span> Audit Logs
                      &amp; Exports
                    </p>
                    <p>
                      <span className="text-purple-400">/</span> Version History
                      &amp; Rollback
                    </p>
                    <p>
                      <span className="text-purple-400">/</span> Settings &amp;
                      Integrations
                    </p>
                  </div>
                  <div className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-600">
                    Full management UI. Approve requests. Compliance exports.
                  </div>
                </TerminalWindow>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-zinc-800/50 py-24">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <p className="text-xs uppercase tracking-widest text-green-500">
                {"// pricing"}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
                Simple, transparent pricing
              </h2>
            </motion.div>

            <motion.div
              className="mt-12 grid gap-6 md:grid-cols-2"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {/* Free Plan */}
              <motion.div variants={fadeInUp}>
                <TerminalWindow title="plan — free" className="h-full">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-green-400">
                      $0
                    </span>
                    <span className="text-xs text-zinc-600">
                      / month / organization
                    </span>
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-400">
                    <span className="h-1 w-1 rounded-full bg-amber-400" />
                    Alpha &middot; Free during early access
                  </div>
                  <div className="mt-5 space-y-2 text-xs">
                    {[
                      "Up to 3 projects",
                      "50 variables per project",
                      "Up to 3 team members",
                      "CLI + VS Code Extension",
                      "Web Dashboard",
                      "AES-256 encrypted vault",
                      "Role-based access control",
                      "7-day audit log retention",
                    ].map((item) => (
                      <p
                        key={item}
                        className="flex items-center gap-2 text-zinc-400"
                      >
                        <Check className="h-3 w-3 shrink-0 text-green-400" />
                        {item}
                      </p>
                    ))}
                  </div>
                  <div className="mt-6">
                    <Link
                      href="/sign-up"
                      className="block rounded border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-center text-xs text-green-400 transition-all hover:bg-green-500/20"
                    >
                      Get Started Free
                    </Link>
                  </div>
                </TerminalWindow>
              </motion.div>

              {/* Pro Plan */}
              <motion.div variants={fadeInUp}>
                <TerminalWindow
                  title="plan — pro (coming soon)"
                  className="h-full"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-zinc-400">
                      $15
                    </span>
                    <span className="text-xs text-zinc-600">
                      / month / organization
                    </span>
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-[10px] text-zinc-500">
                    <span className="h-1 w-1 rounded-full bg-zinc-500" />
                    Coming soon
                  </div>
                  <div className="mt-5 space-y-2 text-xs">
                    {[
                      "Unlimited projects",
                      "Unlimited variables",
                      "Unlimited team members",
                      "Version history & rollback",
                      "Bulk .env import",
                      "Granular permissions",
                      "365-day audit retention",
                      "Priority support",
                    ].map((item) => (
                      <p
                        key={item}
                        className="flex items-center gap-2 text-zinc-500"
                      >
                        <Check className="h-3 w-3 shrink-0 text-zinc-600" />
                        {item}
                      </p>
                    ))}
                  </div>
                  <div className="mt-6">
                    <span className="block rounded border border-zinc-700 px-4 py-2.5 text-center text-xs text-zinc-600 cursor-not-allowed">
                      Coming Soon
                    </span>
                  </div>
                </TerminalWindow>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-zinc-800/50 bg-zinc-900/30 py-24">
          <div className="mx-auto max-w-5xl px-4 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <TerminalWindow
                title="bash — get started"
                className="mx-auto max-w-lg"
              >
                <p className="text-zinc-500"># Ready to secure your secrets?</p>
                <p className="mt-2">
                  <span className="text-green-500">$</span>{" "}
                  <span className="text-zinc-300">
                    npm install -g @envpilot/cli
                  </span>
                </p>
                <p className="mt-1 text-green-400/70">
                  <span className="text-green-500">$</span>{" "}
                  <span className="text-zinc-300">envpilot login</span>
                </p>
                <p className="mt-1 text-green-400/70">
                  <span className="text-green-500">$</span>{" "}
                  <span className="text-zinc-300">envpilot init</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-green-400/70">
                  <Check className="h-3 w-3" />
                  Project initialized. Welcome aboard.
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Link
                    href="/sign-up"
                    className="rounded border border-green-500/30 bg-green-500/10 px-5 py-2 text-center text-xs text-green-400 transition-all hover:bg-green-500/20"
                  >
                    Start Free
                  </Link>
                  <Link
                    href="/docs"
                    className="flex items-center justify-center gap-1.5 rounded border border-zinc-700 px-5 py-2 text-center text-xs text-zinc-400 transition-all hover:border-zinc-600"
                  >
                    <FileText className="h-3 w-3" />
                    Read the Docs
                  </Link>
                </div>
              </TerminalWindow>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-8">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span className="text-green-500">$</span> envpilot --version{" "}
              <span className="text-zinc-500">1.0.0</span>
            </div>
            <div className="flex gap-4 text-xs text-zinc-600">
              <Link href="/docs" className="hover:text-zinc-400">
                Docs
              </Link>
              <Link href="/changelog" className="hover:text-zinc-400">
                Changelog
              </Link>
              <Link href="/privacy" className="hover:text-zinc-400">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-zinc-400">
                Terms
              </Link>
              <Link href="/support" className="hover:text-zinc-400">
                Support
              </Link>
              <Link href="/contact" className="hover:text-zinc-400">
                Contact
              </Link>
            </div>
            <div className="text-right text-xs text-zinc-700">
              <p>&copy; {new Date().getFullYear()} Envpilot</p>
              <p className="text-[10px] text-zinc-800">
                Built at{" "}
                <a
                  href="https://syntaxlabtechnology.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-500"
                >
                  Syntax Lab Technology
                </a>{" "}
                &middot;{" "}
                <a
                  href="https://rafay99.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-500"
                >
                  Abdul Rafay
                </a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
