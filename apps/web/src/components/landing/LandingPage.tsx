"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useScroll } from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  FileWarning,
  GitBranch,
  Lock,
  Monitor,
  Puzzle,
  ShieldCheck,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import {
  MarketingShell,
  SectionHeading,
  GlowCard,
  TerminalFrame,
  TerminalPlayer,
  ParticleField,
  AuroraGlow,
  GridLines,
  Noise,
  Reveal,
  Stagger,
  StaggerItem,
  fadeUp,
  staggerContainer,
  type TerminalScene,
} from "@/components/marketing";
import type { PricingData } from "@/components/pricing/PricingContent";

/* ────────────────────────────── hero ────────────────────────────── */

const HERO_SCENES: TerminalScene[] = [
  {
    command: "envpilot run -- bun dev",
    output: [
      { text: "✓ Injected 47 variables from backend-api/staging", tone: "ok" },
      { text: "⚡ fingerprint cache hit — ready in 0.3s", tone: "dim" },
      { text: "$ bun dev — server listening on :3000", tone: "out" },
    ],
  },
  {
    command: "envpilot pull --env production",
    output: [
      { text: "✓ Pulled 32 variables from backend-api/production", tone: "ok" },
      { text: "🔒 decrypted in memory — nothing written to disk", tone: "dim" },
    ],
  },
  {
    command: "envpilot push --env staging --dry-run",
    output: [
      { text: "~ 3 changes detected", tone: "warn" },
      { text: "  + STRIPE_WEBHOOK_SECRET", tone: "ok" },
      { text: "  ± DATABASE_POOL_SIZE  10 → 25", tone: "warn" },
      { text: "dry-run: no changes applied", tone: "dim" },
    ],
  },
  {
    command: "envpilot audit --days 7 --format json",
    output: [
      { text: "✓ 142 events across 6 team members", tone: "ok" },
      { text: "exported → audit-report.json", tone: "dim" },
    ],
  },
];

const HERO_STATS = [
  { value: "AES-256", label: "encryption at rest" },
  { value: "40+", label: "audit event types" },
  { value: "3", label: "synced surfaces" },
  { value: "0", label: "plaintext secrets stored" },
];

function InstallChip() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText("npm install -g @envpilot/cli");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — nothing to do
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={
        copied ? "Copied to clipboard" : "Copy install command to clipboard"
      }
      aria-live="polite"
      className="group inline-flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 font-mono text-xs text-zinc-400 transition-colors hover:border-green-500/30 hover:text-zinc-200"
    >
      <span aria-hidden className="text-green-500">
        $
      </span>
      npm install -g @envpilot/cli
      {copied ? (
        <Check aria-hidden className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy
          aria-hidden
          className="h-3.5 w-3.5 text-zinc-600 transition-colors group-hover:text-green-400"
        />
      )}
    </button>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-[92vh] items-center overflow-hidden">
      <AuroraGlow />
      <GridLines />
      <ParticleField />
      <Noise />

      <motion.div
        className="relative z-10 mx-auto w-full max-w-5xl px-4 py-24 text-center sm:px-6"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.div variants={fadeUp}>
          <Link
            href="/changelog"
            className="group inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-4 py-1.5 font-mono text-xs text-green-400 transition-colors hover:border-green-500/40"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 [animation:pulse-glow_2.4s_ease-in-out_infinite]" />
            New: inject secrets at runtime — no .env file needed
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mx-auto mt-8 max-w-4xl font-sans text-4xl font-bold tracking-tight text-zinc-100 [text-wrap:balance] sm:text-5xl md:text-7xl"
        >
          Secrets management
          <br />
          <span className="gradient-text-green text-glow-green">
            from your terminal.
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-6 max-w-2xl font-mono text-sm leading-relaxed text-zinc-500 md:text-base"
        >
          Stop sharing .env files over Slack. AES-256 encrypted storage,
          role-based access, and runtime injection — for teams that live in the
          terminal.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-lg bg-green-500 px-7 py-3.5 font-mono text-sm font-semibold text-zinc-950 shadow-[0_0_40px_-8px_rgba(34,197,94,0.6)] transition-shadow hover:shadow-[0_0_60px_-8px_rgba(34,197,94,0.8)]"
            >
              Get started free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
          <InstallChip />
        </motion.div>

        <motion.div variants={fadeUp} className="mx-auto mt-14 max-w-3xl">
          <TerminalFrame title="bash — envpilot" glow bodyClassName="text-left">
            <div className="min-h-[148px]">
              <TerminalPlayer scenes={HERO_SCENES} />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.04]"
            >
              <div
                className="h-24 w-full bg-gradient-to-b from-transparent via-green-400 to-transparent"
                style={{ animation: "scanline 7s linear infinite" }}
              />
            </div>
          </TerminalFrame>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-800/60 md:grid-cols-4"
        >
          {HERO_STATS.map((stat) => (
            <div key={stat.label} className="bg-zinc-950/90 px-4 py-5">
              <p className="font-sans text-2xl font-bold text-green-400">
                {stat.value}
              </p>
              <p className="mt-1 font-mono text-[11px] text-zinc-600">
                {stat.label}
              </p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ─────────────────────────── command marquee ─────────────────────────── */

const MARQUEE_COMMANDS = [
  "envpilot run -- bun dev",
  "envpilot pull --env production",
  "envpilot push --env staging --dry-run",
  "envpilot switch production",
  "envpilot list variables --show-values",
  "envpilot audit --days 90 --format json",
  "envpilot run --print",
  "envpilot login",
  "envpilot init",
];

function CommandMarquee() {
  const items = [...MARQUEE_COMMANDS, ...MARQUEE_COMMANDS];
  return (
    <div className="relative border-y border-zinc-800/60 bg-zinc-900/30 py-5">
      <div
        className="overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
        }}
      >
        <div className="animate-marquee flex w-max gap-10">
          {items.map((cmd, i) => (
            <span
              key={`${cmd}-${i}`}
              className="whitespace-nowrap font-mono text-xs text-zinc-600"
            >
              <span className="mr-2 text-green-500/70">❯</span>
              {cmd}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── features ────────────────────────────── */

function EncryptionVisual() {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-4 font-mono text-xs">
      <p className="text-zinc-500">
        <span className="text-amber-400">DATABASE_URL</span>
        <span className="text-zinc-700">=</span>
        <span className="text-zinc-400">postgres://admin:•••@prod:5432</span>
      </p>
      <p className="mt-2 flex items-center gap-2 text-zinc-700">
        <Lock className="h-3 w-3 text-green-500" />
        <span
          className="bg-[linear-gradient(110deg,#3f3f46_35%,#22c55e_50%,#3f3f46_65%)] bg-[length:200%_100%] bg-clip-text text-transparent"
          style={{ animation: "shimmer 3s linear infinite" }}
        >
          a4f7c2…91e8d3…b06f4a…aes-256-gcm
        </span>
      </p>
      <p className="mt-2 text-zinc-600">
        ✓ sealed in vault — reference id stored, value never touches the
        database
      </p>
    </div>
  );
}

function InjectionVisual() {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-4 font-mono text-xs">
      <p>
        <span className="text-green-500">❯</span>{" "}
        <span className="text-zinc-300">envpilot run -- bun dev</span>
      </p>
      <p className="mt-1.5 text-green-400/80">
        ✓ 47 vars injected into process env
      </p>
      <p className="mt-1.5 text-zinc-600">
        ✗ .env file written&nbsp;&nbsp;→&nbsp;&nbsp;
        <span className="text-green-400">never</span>
      </p>
      <p className="text-zinc-600">
        ✗ secrets on disk&nbsp;&nbsp;&nbsp;&nbsp;→&nbsp;&nbsp;
        <span className="text-green-400">gone when the process exits</span>
      </p>
    </div>
  );
}

const FEATURES = [
  {
    icon: Terminal,
    title: "Runtime Injection",
    desc: "Inject secrets directly into any process with envpilot run. No .env file written, nothing to leak. Fingerprint-gated cache keeps startup near-instant.",
    visual: <InjectionVisual />,
    wide: true,
  },
  {
    icon: Lock,
    title: "End-to-End Encryption",
    desc: "AES-256 encryption at rest via an isolated vault. Zero-knowledge architecture — plaintext secrets never touch the database.",
    visual: <EncryptionVisual />,
    wide: true,
  },
  {
    icon: Users,
    title: "Role-Based Access",
    desc: "Role-based access with per-variable permissions. Developers request access; leads, managers, and owners approve.",
  },
  {
    icon: Eye,
    title: "Audit Logging",
    desc: "40+ event types with IP, user agent, and location. Filter, search, and export for SOC 2 compliance.",
  },
  {
    icon: Puzzle,
    title: "VS Code Extension",
    desc: "Real-time WebSocket sync, multi-directory linking, automatic file cleanup the moment access is revoked.",
  },
  {
    icon: Monitor,
    title: "Web Dashboard",
    desc: "Manage projects, variables, teams, and audit logs. Approve requests and export compliance reports.",
  },
];

function FeaturesBento() {
  return (
    <section id="features" className="relative scroll-mt-20 py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="features"
          title={
            <>
              Built for the <span className="text-green-400">command line</span>
            </>
          }
          description="Everything your team needs to stop treating secrets like chat messages — encrypted, access-controlled, and fully auditable."
        />

        <Stagger className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <StaggerItem
              key={feature.title}
              className={feature.wide ? "lg:col-span-2" : ""}
            >
              <GlowCard className="h-full">
                <div className="flex h-full flex-col p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-green-500/20 bg-green-500/5">
                      <feature.icon className="h-4 w-4 text-green-400" />
                    </span>
                    <h3 className="font-sans text-base font-semibold text-zinc-100">
                      {feature.title}
                    </h3>
                  </div>
                  <p className="mt-3 font-mono text-xs leading-relaxed text-zinc-500">
                    {feature.desc}
                  </p>
                  {feature.visual}
                </div>
              </GlowCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ────────────────────────────── workflow ────────────────────────────── */

const WORKFLOW_STEPS = [
  {
    label: "Install",
    cmd: "npm install -g @envpilot/cli",
    output: "added 1 package in 2.3s",
    desc: "One global package. Works with npm, bun, pnpm, and yarn.",
  },
  {
    label: "Login",
    cmd: "envpilot login",
    output: "✓ Authenticated as dev@company.com",
    desc: "Browser-based SSO — no API keys to paste into your shell history.",
  },
  {
    label: "Init",
    cmd: "envpilot init",
    output: "✓ Linked to project: backend-api (staging)",
    desc: "Link any directory to a project and environment in seconds.",
  },
  {
    label: "Run",
    cmd: "envpilot run -- bun dev",
    output: "✓ Injected 47 variables from backend-api/staging",
    desc: "Secrets land in process memory, never on disk. That's it — you're running.",
  },
];

function Workflow() {
  const lineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: lineRef,
    offset: ["start 0.75", "end 0.55"],
  });

  return (
    <section
      id="workflow"
      className="relative scroll-mt-20 border-y border-zinc-800/50 bg-zinc-900/20 py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="workflow"
          title={
            <>
              Zero to running in{" "}
              <span className="text-green-400">four commands</span>
            </>
          }
        />

        <div ref={lineRef} className="relative mt-16 ml-4 sm:ml-6">
          {/* Track + scroll-driven progress line */}
          <div className="absolute top-2 bottom-2 left-0 w-px bg-zinc-800" />
          <motion.div
            className="absolute top-2 bottom-2 left-0 w-px origin-top bg-gradient-to-b from-green-400 to-green-500/40"
            style={{ scaleY: scrollYProgress }}
          />

          <div className="space-y-10">
            {WORKFLOW_STEPS.map((step, i) => (
              <Reveal key={step.label} className="relative pl-10 sm:pl-14">
                <span className="absolute top-1 -left-[15px] flex h-8 w-8 items-center justify-center rounded-full border border-green-500/30 bg-zinc-950 font-mono text-xs font-bold text-green-400 shadow-[0_0_16px_-4px_rgba(34,197,94,0.5)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-10">
                  <div className="lg:w-72 lg:shrink-0">
                    <h3 className="font-sans text-lg font-semibold text-zinc-100">
                      {step.label}
                    </h3>
                    <p className="mt-1.5 font-mono text-xs leading-relaxed text-zinc-500">
                      {step.desc}
                    </p>
                  </div>
                  <div className="flex-1 rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-4 font-mono text-xs sm:text-sm">
                    <p>
                      <span className="text-green-500">❯</span>{" "}
                      <span className="text-zinc-200">{step.cmd}</span>
                    </p>
                    <p className="mt-1 text-green-400/70">{step.output}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── before/after ───────────────────────────── */

function BeforeAfter() {
  return (
    <section className="relative py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="demo"
          title={
            <>
              No .env file. <span className="text-green-400">Ever.</span>
            </>
          }
          description="The .env file is a liability with a filename. Envpilot replaces it with encrypted, access-controlled runtime injection."
          align="center"
          className="items-center"
        />

        <Stagger className="mt-14 grid gap-6 lg:grid-cols-2">
          <StaggerItem className="flex">
            <div className="relative w-full rounded-xl bg-gradient-to-b from-red-500/25 via-zinc-700/30 to-zinc-800/30 p-px shadow-[0_0_60px_-20px_rgba(239,83,80,0.3)]">
              <div className="flex h-full flex-col overflow-hidden rounded-[11px] bg-zinc-950/95">
                <div className="flex items-center gap-2 border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-2.5">
                  <FileWarning className="h-3.5 w-3.5 text-red-400" />
                  <span className="font-mono text-xs text-zinc-500">
                    before — .env shared via Slack
                  </span>
                </div>
                <div className="space-y-1.5 p-5 font-mono text-xs">
                  <p className="text-zinc-600"># DON&apos;T COMMIT THIS!</p>
                  <p>
                    <span className="text-amber-400">DATABASE_URL</span>
                    <span className="text-zinc-700">=</span>
                    <span className="text-red-400">
                      postgres://admin:p@ssw0rd@prod.db:5432
                    </span>
                  </p>
                  <p>
                    <span className="text-amber-400">API_SECRET</span>
                    <span className="text-zinc-700">=</span>
                    <span className="text-red-400">
                      sk_live_4eC39HqLyjWDarj
                    </span>
                  </p>
                  <p>
                    <span className="text-amber-400">AWS_SECRET_KEY</span>
                    <span className="text-zinc-700">=</span>
                    <span className="text-red-400">wJalrXUtnFEMI/K7MDENG</span>
                  </p>
                  <p className="mt-3 flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-red-400">
                    <FileWarning className="h-3.5 w-3.5 shrink-0" />
                    Leaked in #general three months ago. Still valid.
                  </p>
                </div>
              </div>
            </div>
          </StaggerItem>

          <StaggerItem className="flex">
            <TerminalFrame
              title="after — envpilot run -- bun dev"
              glow
              className="w-full"
            >
              <div className="space-y-1.5 text-xs">
                <p className="text-zinc-600">
                  # No .env file. Secrets injected at runtime.
                </p>
                <p className="mt-1">
                  <span className="text-green-500">❯</span>{" "}
                  <span className="text-zinc-200">envpilot run -- bun dev</span>
                </p>
                <p className="text-green-400/80">
                  ✓ Injected 12 vars from backend/staging{" "}
                  <span className="text-zinc-600">⚡ cache (4s ago)</span>
                </p>
                <p className="text-zinc-500">
                  <span className="text-amber-400">DATABASE_URL</span>
                  <span className="text-zinc-700"> → </span>
                  <span className="text-green-400/70">decrypted in memory</span>
                </p>
                <p className="text-zinc-500">
                  <span className="text-amber-400">API_SECRET</span>
                  <span className="text-zinc-700"> → </span>
                  <span className="text-green-400/70">decrypted in memory</span>
                </p>
                <p className="mt-3 flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 text-green-400">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  Never written to disk. Gone when the process exits.
                </p>
              </div>
            </TerminalFrame>
          </StaggerItem>
        </Stagger>
      </div>
    </section>
  );
}

/* ────────────────────────────── platform ────────────────────────────── */

const SURFACES = [
  {
    icon: Terminal,
    title: "CLI Tool",
    accent: "text-green-400",
    lines: [
      "❯ envpilot login",
      "❯ envpilot init",
      "❯ envpilot run -- bun dev",
      "❯ envpilot pull --env production",
      "❯ envpilot push --dry-run",
      "❯ envpilot switch staging",
    ],
    footer: "12 commands. Runtime injection. Browser SSO. CI/CD ready.",
  },
  {
    icon: Puzzle,
    title: "VS Code Extension",
    accent: "text-blue-400",
    lines: [
      "> Envpilot: Sign In",
      "> Envpilot: Link Project",
      "> Envpilot: Pull Variables",
      "> Envpilot: Add Directory",
      "> Envpilot: Select Environments",
      "> Envpilot: Request Variable",
    ],
    footer:
      "Real-time WebSocket sync. Multi-directory. Auto-cleanup on revoke.",
  },
  {
    icon: Monitor,
    title: "Web Dashboard",
    accent: "text-purple-400",
    lines: [
      "/ Projects & Environments",
      "/ Variables & Secrets",
      "/ Team & Permissions",
      "/ Audit Logs & Exports",
      "/ Version History & Rollback",
      "/ Settings & Integrations",
    ],
    footer: "Full management UI. Approve requests. Compliance exports.",
  },
];

function Platform() {
  return (
    <section className="relative border-y border-zinc-800/50 bg-zinc-900/20 py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="platform"
          title={
            <>
              Three surfaces, <span className="text-green-400">one vault</span>
            </>
          }
          description="Terminal, IDE, or browser — your secrets stay encrypted and in sync everywhere your team works."
        />

        <Stagger className="mt-14 grid gap-4 md:grid-cols-3">
          {SURFACES.map((surface) => (
            <StaggerItem key={surface.title}>
              <motion.div whileHover={{ y: -6 }} className="h-full">
                <GlowCard className="h-full">
                  <div className="flex h-full flex-col p-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80">
                        <surface.icon className={`h-4 w-4 ${surface.accent}`} />
                      </span>
                      <h3 className="font-sans text-base font-semibold text-zinc-100">
                        {surface.title}
                      </h3>
                    </div>
                    <div className="mt-5 space-y-1.5 font-mono text-xs text-zinc-500">
                      {surface.lines.map((line) => (
                        <p key={line}>
                          <span className={`${surface.accent} opacity-80`}>
                            {line.slice(0, 1)}
                          </span>
                          {line.slice(1)}
                        </p>
                      ))}
                    </div>
                    <p className="mt-5 border-t border-zinc-800/80 pt-4 font-mono text-[11px] leading-relaxed text-zinc-600">
                      {surface.footer}
                    </p>
                  </div>
                </GlowCard>
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/* ────────────────────────────── pricing ────────────────────────────── */

/**
 * Generate human-readable feature lines from resolved feature data.
 * Used as fallback when highlightFeatures is not seeded yet.
 */
function generateFeatureLines(
  features: Array<{
    key: string;
    displayName: string;
    valueType: string;
    value: boolean | number | null;
  }>
): string[] {
  const lines: string[] = [];
  for (const f of features) {
    if (f.valueType === "numeric") {
      if (f.value === null)
        lines.push(
          `Unlimited ${f.displayName.toLowerCase().replace(/^max\s*/i, "")}`
        );
      else if (typeof f.value === "number")
        lines.push(
          `${f.value} ${f.displayName.toLowerCase().replace(/^max\s*/i, "")}`
        );
    } else if (f.valueType === "boolean" && f.value === true) {
      lines.push(f.displayName);
    }
  }
  return lines.slice(0, 8);
}

function PricingCards({
  pricingData: serverPricingData,
  paymentsEnabled: serverPaymentsEnabled,
}: {
  pricingData: PricingData | null;
  paymentsEnabled: boolean | null;
}) {
  // Server-rendered data is passed down from app/page.tsx; the client
  // query only runs as a fallback when the server fetch failed.
  const clientPricingData = useQuery(
    api.features.featureRegistry.queries.getPricingData,
    serverPricingData ? "skip" : {}
  );
  const clientPaymentsEnabled = useQuery(
    api.features.billing.tierLimits.isPaymentsEnabled,
    serverPaymentsEnabled !== null ? "skip" : {}
  );
  const pricingData =
    serverPricingData ?? (clientPricingData as PricingData | undefined);
  const paymentsEnabled = serverPaymentsEnabled ?? clientPaymentsEnabled;

  if (!pricingData) {
    return (
      <div className="mt-14 grid gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-96 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40"
          />
        ))}
      </div>
    );
  }

  return (
    <Stagger className="mt-14 grid gap-6 md:grid-cols-2">
      {pricingData.tiers.map((tier) => {
        // When payments are disabled via admin toggle, paid tiers show as "Coming Soon"
        const isComingSoon =
          tier.isComingSoon || (!tier.isDefault && paymentsEnabled === false);
        const isDefault = tier.isDefault;
        const price = tier.monthlyPrice ?? 0;
        const highlights =
          tier.highlightFeatures.length > 0
            ? tier.highlightFeatures
            : generateFeatureLines(tier.features);
        const cta =
          tier.ctaText ||
          (isComingSoon
            ? "Coming Soon"
            : isDefault
              ? "Get Started Free"
              : "Upgrade");
        const ctaHref = tier.ctaLink || "/sign-up";

        const badgeColorClass =
          tier.badgeColor === "amber"
            ? "border-amber-500/20 bg-amber-500/5 text-amber-400"
            : tier.badgeColor === "green"
              ? "border-green-500/20 bg-green-500/5 text-green-400"
              : "border-zinc-700 bg-zinc-800/50 text-zinc-500";
        const dotColorClass =
          tier.badgeColor === "amber"
            ? "bg-amber-400"
            : tier.badgeColor === "green"
              ? "bg-green-400"
              : "bg-zinc-500";

        return (
          <StaggerItem key={tier.name} className="flex">
            <div
              className={`relative w-full rounded-2xl p-px ${
                isDefault && !isComingSoon
                  ? "bg-gradient-to-b from-green-500/50 via-zinc-700/40 to-zinc-800/40 shadow-[0_0_60px_-16px_rgba(34,197,94,0.35)]"
                  : "bg-zinc-800/60"
              }`}
            >
              <div className="flex h-full flex-col rounded-[15px] bg-zinc-950/95 p-7">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
                    {tier.name}
                  </span>
                  {tier.badge && (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${badgeColorClass}`}
                    >
                      <span
                        className={`h-1 w-1 rounded-full ${dotColorClass}`}
                      />
                      {tier.badge}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span
                    className={`font-sans text-5xl font-bold tracking-tight ${
                      isComingSoon ? "text-zinc-400" : "text-zinc-100"
                    }`}
                  >
                    ${price}
                  </span>
                  <span className="font-mono text-xs text-zinc-600">
                    / month / organization
                  </span>
                </div>
                <div className="mt-7 space-y-2.5">
                  {highlights.map((item: string) => (
                    <p
                      key={item}
                      className={`flex items-start gap-2.5 font-mono text-xs ${
                        isComingSoon ? "text-zinc-600" : "text-zinc-400"
                      }`}
                    >
                      <Check
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          isComingSoon ? "text-zinc-700" : "text-green-400"
                        }`}
                      />
                      {item}
                    </p>
                  ))}
                </div>
                <div className="mt-8 flex-1" />
                {isComingSoon ? (
                  <span className="block cursor-not-allowed rounded-lg border border-zinc-800 px-5 py-3 text-center font-mono text-xs text-zinc-600">
                    {cta}
                  </span>
                ) : (
                  <Link
                    href={ctaHref}
                    className={`block rounded-lg px-5 py-3 text-center font-mono text-xs font-semibold transition-all ${
                      isDefault
                        ? "bg-green-500 text-zinc-950 shadow-[0_0_30px_-8px_rgba(34,197,94,0.6)] hover:shadow-[0_0_45px_-8px_rgba(34,197,94,0.8)]"
                        : "border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                    }`}
                  >
                    {cta}
                  </Link>
                )}
              </div>
            </div>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

function Pricing({
  pricingData,
  paymentsEnabled,
}: {
  pricingData: PricingData | null;
  paymentsEnabled: boolean | null;
}) {
  return (
    <section id="pricing" className="relative scroll-mt-20 py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="pricing"
          title={
            <>
              Simple, <span className="text-green-400">transparent</span>{" "}
              pricing
            </>
          }
          description="Start free. Upgrade when you need more power. Every plan includes AES-256 encryption, RBAC, and real-time sync."
          align="center"
          className="items-center"
        />
        <PricingCards
          pricingData={pricingData}
          paymentsEnabled={paymentsEnabled}
        />
        <Reveal className="mt-8 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 transition-colors hover:text-green-400"
          >
            Compare all features
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────── final CTA ────────────────────────────── */

function FinalCTA() {
  return (
    <section className="relative overflow-hidden border-t border-zinc-800/50 py-32">
      <AuroraGlow />
      <GridLines />
      <Noise />
      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-3 py-1 font-mono text-[11px] tracking-widest text-green-400">
            <Zap className="h-3 w-3" />
            {"// ready when you are"}
          </span>
          <h2 className="mt-6 font-sans text-3xl font-bold tracking-tight text-zinc-100 [text-wrap:balance] sm:text-4xl md:text-6xl">
            Stop pasting secrets
            <br />
            <span className="gradient-text-green">into Slack.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-mono text-sm leading-relaxed text-zinc-500">
            Set up your first project in under two minutes. Free plan, no credit
            card required.
          </p>
        </Reveal>

        <Reveal delay={0.15} className="mx-auto mt-10 max-w-md">
          <TerminalFrame title="bash — get started" glow>
            <div className="space-y-1.5 text-left text-xs sm:text-sm">
              <p>
                <span className="text-green-500">❯</span>{" "}
                <span className="text-zinc-200">
                  npm install -g @envpilot/cli
                </span>
              </p>
              <p>
                <span className="text-green-500">❯</span>{" "}
                <span className="text-zinc-200">envpilot login</span>
              </p>
              <p>
                <span className="text-green-500">❯</span>{" "}
                <span className="text-zinc-200">envpilot init</span>
              </p>
              <p className="flex items-center gap-2 text-green-400/80">
                <Check className="h-3.5 w-3.5" />
                Project initialized. Welcome aboard.
              </p>
            </div>
          </TerminalFrame>
        </Reveal>

        <Reveal
          delay={0.25}
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-lg bg-green-500 px-7 py-3.5 font-mono text-sm font-semibold text-zinc-950 shadow-[0_0_40px_-8px_rgba(34,197,94,0.6)] transition-shadow hover:shadow-[0_0_60px_-8px_rgba(34,197,94,0.8)]"
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-7 py-3.5 font-mono text-sm text-zinc-400 transition-colors hover:border-green-500/30 hover:text-zinc-200"
          >
            <GitBranch className="h-4 w-4" />
            Read the docs
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────── page ────────────────────────────── */

export default function LandingPage({
  pricingData = null,
  paymentsEnabled = null,
}: {
  pricingData?: PricingData | null;
  paymentsEnabled?: boolean | null;
}) {
  const { scrollYProgress } = useScroll();

  return (
    <MarketingShell>
      {/* Scroll progress indicator */}
      <motion.div
        className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-green-600 via-green-400 to-emerald-300"
        style={{ scaleX: scrollYProgress }}
      />
      <Hero />
      <CommandMarquee />
      <FeaturesBento />
      <Workflow />
      <BeforeAfter />
      <Platform />
      <Pricing pricingData={pricingData} paymentsEnabled={paymentsEnabled} />
      <FinalCTA />
    </MarketingShell>
  );
}
