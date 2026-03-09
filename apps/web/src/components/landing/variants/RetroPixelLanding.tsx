"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

function PixelBorder({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative border-2 border-indigo-400/30 bg-indigo-950/40 ${className}`}
      style={{ imageRendering: "pixelated" }}
    >
      {/* Corner pixels */}
      <div className="absolute -top-1 -left-1 h-2 w-2 bg-indigo-400" />
      <div className="absolute -top-1 -right-1 h-2 w-2 bg-indigo-400" />
      <div className="absolute -bottom-1 -left-1 h-2 w-2 bg-indigo-400" />
      <div className="absolute -bottom-1 -right-1 h-2 w-2 bg-indigo-400" />
      {children}
    </div>
  );
}

function ProgressBar({
  value,
  max,
  label,
  color = "bg-green-400",
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-indigo-200">{label}</span>
        <span className="font-mono text-indigo-400">{pct}%</span>
      </div>
      <div className="mt-1 h-4 w-full bg-indigo-950 border border-indigo-400/20">
        <motion.div
          className={`h-full ${color}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
}

function ScoreCounter() {
  const [score, setScore] = useState(0);
  const target = 10000000;

  useEffect(() => {
    let start = 0;
    const increment = Math.ceil(target / 60);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setScore(target);
        clearInterval(timer);
      } else {
        setScore(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="font-mono tabular-nums">{score.toLocaleString()}</span>
  );
}

export default function RetroPixelLanding() {
  const achievements = [
    {
      icon: "🔐",
      title: "VAULT MASTER",
      desc: "AES-256 zero-knowledge encryption enabled",
      unlocked: true,
    },
    {
      icon: "👥",
      title: "TEAM BUILDER",
      desc: "Three-tier RBAC with per-variable permissions",
      unlocked: true,
    },
    {
      icon: "⚡",
      title: "SPEED RUNNER",
      desc: "Real-time WebSocket sync via VS Code extension",
      unlocked: true,
    },
    {
      icon: "🛡️",
      title: "GUARDIAN",
      desc: "Request & approval workflow for sensitive vars",
      unlocked: true,
    },
    {
      icon: "📊",
      title: "DETECTIVE",
      desc: "40+ audit action types with IP tracking",
      unlocked: true,
    },
    {
      icon: "🚀",
      title: "DEPLOYER",
      desc: "CLI pull/push/diff with CI/CD integration",
      unlocked: true,
    },
  ];

  const levels = [
    {
      level: "1",
      title: "Install",
      desc: "npm install -g @envpilot/cli",
      xp: "+100 XP",
    },
    {
      level: "2",
      title: "Login",
      desc: "envpilot login (browser-based SSO)",
      xp: "+200 XP",
    },
    {
      level: "3",
      title: "Init",
      desc: "envpilot init → pick org, project, env",
      xp: "+300 XP",
    },
    {
      level: "4",
      title: "Pull",
      desc: "envpilot pull → sync 47 vars to .env",
      xp: "+500 XP",
    },
    {
      level: "5",
      title: "Push",
      desc: "envpilot push → deploy to staging",
      xp: "+500 XP",
    },
    {
      level: "BOSS",
      title: "Ship",
      desc: "Production deployed. Secrets secured.",
      xp: "+1000 XP",
    },
  ];

  return (
    <div
      className="min-h-screen bg-indigo-950 text-indigo-100"
      style={{ fontFamily: "'Geist Mono', monospace" }}
    >
      {/* Pixel grid bg */}
      <div
        className="fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(129,140,248,1) 1px, transparent 1px), linear-gradient(90deg, rgba(129,140,248,1) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b-2 border-indigo-400/20 bg-indigo-950/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg text-yellow-400">&#9733;</span>
            <span className="text-sm font-bold tracking-wider text-indigo-200">
              ENVPILOT
            </span>
            <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-bold text-green-400">
              v2.0
            </span>
          </Link>

          <div className="flex items-center gap-2 text-xs">
            <span className="hidden font-bold text-yellow-400 md:inline">
              SCORE: <ScoreCounter />+
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-xs font-bold text-indigo-400 hover:text-indigo-200 transition-colors"
            >
              LOAD GAME
            </Link>
            <Link
              href="/sign-up"
              className="border-2 border-yellow-400 bg-yellow-400/10 px-3 py-1.5 text-xs font-bold text-yellow-400 hover:bg-yellow-400/20 transition-colors"
            >
              NEW GAME
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-14">
        {/* Hero */}
        <section className="flex min-h-[85vh] items-center py-20">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.div
                variants={fadeIn}
                className="mb-4 inline-block border border-yellow-400/30 bg-yellow-400/5 px-3 py-1"
              >
                <span className="text-xs font-bold text-yellow-400">
                  &#9654; PRESS START TO SECURE YOUR SECRETS
                </span>
              </motion.div>

              <motion.h1
                variants={fadeIn}
                className="text-4xl font-black uppercase leading-tight tracking-tight md:text-6xl lg:text-7xl"
              >
                <span className="text-indigo-200">Level Up</span>
                <br />
                <span className="text-yellow-400">Your Security</span>
              </motion.h1>

              <motion.p
                variants={fadeIn}
                className="mt-5 max-w-lg text-sm leading-relaxed text-indigo-400"
              >
                Stop sharing secrets via Slack like it&apos;s 2015. Envpilot
                gives your team encrypted vault storage, role-based access, and
                CLI-native workflows. Game on.
              </motion.p>

              <motion.div variants={fadeIn} className="mt-8">
                <PixelBorder className="inline-block p-4">
                  <div className="space-y-2 text-xs">
                    <p className="text-indigo-400">SELECT YOUR CLASS:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        {
                          label: "ADMIN",
                          desc: "Full control",
                          color: "text-violet-400 border-violet-400/30",
                        },
                        {
                          label: "LEAD",
                          desc: "Manage team",
                          color: "text-amber-400 border-amber-400/30",
                        },
                        {
                          label: "MEMBER",
                          desc: "Request access",
                          color: "text-blue-400 border-blue-400/30",
                        },
                      ].map((cls) => (
                        <div
                          key={cls.label}
                          className={`border bg-indigo-950/60 p-2 text-center ${cls.color}`}
                        >
                          <p className="font-bold">{cls.label}</p>
                          <p className="mt-0.5 text-[10px] text-indigo-500">
                            {cls.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </PixelBorder>
              </motion.div>

              <motion.div variants={fadeIn} className="mt-8 flex gap-3">
                <Link
                  href="/sign-up"
                  className="border-2 border-yellow-400 bg-yellow-400 px-6 py-3 text-sm font-black text-indigo-950 hover:bg-yellow-300 transition-colors"
                >
                  START GAME
                </Link>
                <Link
                  href="#achievements"
                  className="border-2 border-indigo-400/30 px-6 py-3 text-sm font-bold text-indigo-300 hover:border-indigo-400/60 transition-colors"
                >
                  VIEW STATS
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="border-y-2 border-indigo-400/20 bg-indigo-900/20 py-8">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              className="grid grid-cols-2 gap-4 md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {[
                { val: "10M+", label: "SECRETS", sub: "ENCRYPTED" },
                { val: "5,000+", label: "GUILDS", sub: "ACTIVE" },
                { val: "99.99%", label: "UPTIME", sub: "SLA" },
                { val: "SOC2", label: "CERTIFIED", sub: "COMPLIANT" },
              ].map((s) => (
                <motion.div key={s.label} variants={fadeIn}>
                  <PixelBorder className="p-3 text-center">
                    <p className="text-2xl font-black text-yellow-400">
                      {s.val}
                    </p>
                    <p className="text-[10px] font-bold text-indigo-400">
                      {s.label}
                    </p>
                    <p className="text-[9px] text-indigo-600">{s.sub}</p>
                  </PixelBorder>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Achievements */}
        <section id="achievements" className="py-24">
          <div className="mx-auto max-w-5xl px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <p className="text-xs font-bold text-yellow-400">
                &#9733; ACHIEVEMENTS UNLOCKED
              </p>
              <h2 className="mt-2 text-3xl font-black uppercase md:text-4xl">
                Feature Set
              </h2>
            </motion.div>

            <motion.div
              className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {achievements.map((a) => (
                <motion.div key={a.title} variants={fadeIn}>
                  <PixelBorder className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{a.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-yellow-400">
                            {a.title}
                          </span>
                          {a.unlocked && (
                            <span className="rounded bg-green-500/20 px-1 text-[9px] font-bold text-green-400">
                              UNLOCKED
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-indigo-400">{a.desc}</p>
                      </div>
                    </div>
                  </PixelBorder>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Level Progression */}
        <section className="border-t-2 border-indigo-400/20 bg-indigo-900/10 py-24">
          <div className="mx-auto max-w-4xl px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <p className="text-xs font-bold text-yellow-400">
                &#9654; QUEST LINE
              </p>
              <h2 className="mt-2 text-3xl font-black uppercase md:text-4xl">
                Getting Started
              </h2>
            </motion.div>

            <motion.div
              className="mt-12 space-y-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              {levels.map((l) => (
                <motion.div key={l.level} variants={fadeIn}>
                  <PixelBorder className="flex items-center gap-4 p-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center border-2 font-black ${
                        l.level === "BOSS"
                          ? "border-red-400 bg-red-500/10 text-red-400 text-xs"
                          : "border-indigo-400/30 bg-indigo-950 text-indigo-300 text-lg"
                      }`}
                    >
                      {l.level === "BOSS" ? "BOSS" : `L${l.level}`}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-indigo-200">
                          {l.title}
                        </span>
                        <span className="text-[10px] font-bold text-green-400">
                          {l.xp}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-indigo-500">
                        {l.desc}
                      </p>
                    </div>
                  </PixelBorder>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Power Stats */}
        <section className="border-t-2 border-indigo-400/20 py-24">
          <div className="mx-auto max-w-4xl px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <p className="text-xs font-bold text-yellow-400">
                &#9650; POWER LEVELS
              </p>
              <h2 className="mt-2 text-3xl font-black uppercase md:text-4xl">
                Security Stats
              </h2>
            </motion.div>

            <motion.div
              className="mt-12 space-y-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.div variants={fadeIn}>
                <ProgressBar
                  value={100}
                  max={100}
                  label="ENCRYPTION"
                  color="bg-green-400"
                />
              </motion.div>
              <motion.div variants={fadeIn}>
                <ProgressBar
                  value={95}
                  max={100}
                  label="ACCESS CONTROL"
                  color="bg-yellow-400"
                />
              </motion.div>
              <motion.div variants={fadeIn}>
                <ProgressBar
                  value={90}
                  max={100}
                  label="AUDIT COVERAGE"
                  color="bg-blue-400"
                />
              </motion.div>
              <motion.div variants={fadeIn}>
                <ProgressBar
                  value={99}
                  max={100}
                  label="UPTIME"
                  color="bg-violet-400"
                />
              </motion.div>
              <motion.div variants={fadeIn}>
                <ProgressBar
                  value={85}
                  max={100}
                  label="DEVELOPER XP"
                  color="bg-red-400"
                />
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t-2 border-indigo-400/20 py-24">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <PixelBorder className="p-8">
                <p className="text-xs font-bold text-yellow-400">
                  &#9733; FINAL BOSS DEFEATED
                </p>
                <h2 className="mt-4 text-3xl font-black uppercase md:text-4xl">
                  Ready to Play?
                </h2>
                <p className="mt-3 text-sm text-indigo-400">
                  Free tier available. No credit card. No strings attached.
                </p>
                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/sign-up"
                    className="border-2 border-yellow-400 bg-yellow-400 px-8 py-3 text-sm font-black text-indigo-950 hover:bg-yellow-300 transition-colors"
                  >
                    START NEW GAME
                  </Link>
                  <Link
                    href="/sign-in"
                    className="border-2 border-indigo-400/30 px-8 py-3 text-sm font-bold text-indigo-300 hover:border-indigo-400/60 transition-colors"
                  >
                    CONTINUE
                  </Link>
                </div>
              </PixelBorder>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-indigo-400/20 py-8">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="text-xs font-bold text-indigo-600">
              &#9733; ENVPILOT v2.0 &middot; &copy; {new Date().getFullYear()}
            </span>
            <div className="flex gap-4">
              {["Privacy", "Terms", "Changelog"].map((l) => (
                <Link
                  key={l}
                  href={`/${l.toLowerCase()}`}
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-400 transition-colors"
                >
                  {l.toUpperCase()}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
