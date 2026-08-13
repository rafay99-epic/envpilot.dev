import Link from "next/link";
import {
  CopyChip,
  TerminalPanel,
  TerminalPlayer,
  terminal,
  type TerminalScene,
} from "@/components/marketing";

const SCENES: TerminalScene[] = [
  {
    command: "envpilot run -- bun dev",
    output: [
      { text: "✓ 47 variables injected — backend-api/production", tone: "ok" },
      {
        text: "  nothing written to disk. gone when the process exits.",
        tone: "dim",
      },
      { text: "$ bun dev — listening on :3000", tone: "out" },
    ],
  },
  {
    command: "envpilot files pull",
    output: [
      { text: "✓ 3 secret files written to their recorded paths", tone: "ok" },
      {
        text: "  service-account.json · id_ed25519 · fullchain.pem",
        tone: "dim",
      },
    ],
  },
  {
    command: "envpilot push --env staging --dry-run",
    output: [
      { text: "~ 3 changes detected", tone: "warn" },
      { text: "  + STRIPE_WEBHOOK_SECRET", tone: "ok" },
      { text: "  ± DATABASE_POOL_SIZE  10 → 25", tone: "warn" },
      { text: "dry-run: nothing applied", tone: "dim" },
    ],
  },
  {
    command: "envpilot diff --env production",
    output: [
      { text: "~ 2 values differ, 1 missing locally", tone: "warn" },
      { text: "  compared by digest — no value ever printed", tone: "dim" },
    ],
  },
];

export function Intro() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-10%] left-1/2 h-[38rem] w-[70rem] -translate-x-1/2 opacity-[0.16]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(34,197,94,0.55), transparent 72%)",
          filter: "blur(70px)",
        }}
      />

      <div className={`${terminal.shell} relative pt-20 pb-16 sm:pt-28`}>
        <p
          className={`${terminal.mono} text-[12px] tracking-[0.18em] text-ink-faint uppercase`}
        >
          envpilot — secret infrastructure for small teams
        </p>

        <h1 className="mt-7 max-w-4xl font-sans text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-ink [text-wrap:balance]">
          Nobody should have to ask
          <br className="hidden sm:block" /> for the{" "}
          <span className="text-accent">.env</span> file.
        </h1>

        <p className="mt-7 max-w-2xl font-sans text-[19px] leading-relaxed text-ink-muted">
          A .env file is a secret with no owner, no expiry, and no memory of who
          read it. Envpilot gives every secret your team shares all three —
          variables, files, and logins alike — then hands them to your terminal,
          your editor, your CI, your API, and your agent from one scoped key.
        </p>

        <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link
            href="/sign-up"
            className="inline-flex items-center rounded-md bg-accent px-6 py-3 font-sans text-[15px] font-semibold text-chrome shadow-[0_0_32px_-10px_rgba(34,197,94,0.9)] transition-colors hover:bg-accent"
          >
            Start free
          </Link>
          <CopyChip text="npm install -g @envpilot/cli" />
        </div>

        <div className="mt-14">
          <TerminalPanel
            title="bash — backend-api/production"
            meta="aes-256-gcm"
          >
            <div className="min-h-[168px]">
              <TerminalPlayer scenes={SCENES} />
            </div>
          </TerminalPanel>
        </div>
      </div>
    </section>
  );
}
