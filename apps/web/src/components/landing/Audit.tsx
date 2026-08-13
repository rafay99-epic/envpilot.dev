import {
  TerminalCommand,
  TerminalPanel,
  TerminalTable,
  terminal,
  type TerminalColumn,
} from "@/components/marketing";

const COLUMNS: TerminalColumn[] = [
  { key: "time", label: "time" },
  { key: "actor", label: "actor" },
  { key: "event", label: "event" },
  { key: "resource", label: "resource" },
  { key: "origin", label: "origin" },
];

const EVENT_TONE = {
  ok: "text-accent",
  warn: "text-warning",
  err: "text-danger",
} as const;

const EVENTS: {
  time: string;
  actor: string;
  event: string;
  tone?: keyof typeof EVENT_TONE;
  resource: string;
  origin: string;
}[] = [
  {
    time: "14:02:11",
    actor: "sara@acme.dev",
    event: "variable.accessed",
    tone: "ok",
    resource: "STRIPE_SECRET_KEY",
    origin: "103.22.14.9 · Karachi, PK",
  },
  {
    time: "13:47:03",
    actor: "ci-bot",
    event: "cicd.secrets_pulled",
    resource: "production · 32 vars",
    origin: "GitHub Actions",
  },
  {
    time: "12:58:40",
    actor: "claude-agent",
    event: "project.docs.create",
    resource: "runbook/deploys (draft)",
    origin: "MCP · scoped key",
  },
  {
    time: "11:19:58",
    actor: "omar@acme.dev",
    event: "variable.requested",
    tone: "warn",
    resource: "AWS_SECRET_KEY",
    origin: "88.4.19.71 · Berlin, DE",
  },
  {
    time: "10:44:02",
    actor: "unknown key",
    event: "security.access_denied",
    tone: "err",
    resource: "envpk_…9f2c (revoked)",
    origin: "51.12.8.240 · unknown",
  },
  {
    time: "09:03:40",
    actor: "sara@acme.dev",
    event: "variable.rotated",
    tone: "ok",
    resource: "POSTMARK_TOKEN",
    origin: "103.22.14.9 · Karachi, PK",
  },
];

const ROWS = EVENTS.map((row) => ({
  key: row.time,
  cells: [
    <span key="time" className="text-ink-faint">
      {row.time}
    </span>,
    <span key="actor" className="text-ink">
      {row.actor}
    </span>,
    <span
      key="event"
      className={row.tone ? EVENT_TONE[row.tone] : "text-ink-muted"}
    >
      {row.event}
    </span>,
    <span key="resource" className="text-ink-muted">
      {row.resource}
    </span>,
    <span key="origin" className="text-ink-faint">
      {row.origin}
    </span>,
  ],
}));

export function Audit() {
  return (
    <section
      id="audit"
      className={`scroll-mt-24 border-y ${terminal.line} bg-white/[0.015] py-24 sm:py-28`}
    >
      <div className={terminal.shell}>
        <TerminalCommand
          cmd="envpilot audit --days 7"
          comment="every read is a row. this is the answer to “who saw this key”."
        />

        <div className="mt-12">
          <TerminalPanel
            title="backend-api · last 7 days"
            meta="142 events · 6 actors"
            bodyClassName="p-0"
          >
            <TerminalTable columns={COLUMNS} rows={ROWS} minWidth={760} />
          </TerminalPanel>

          <p
            className={`mt-5 ${terminal.mono} text-[12px] leading-relaxed text-ink-subtle`}
          >
            40+ event types · IP, user agent and location on every row · CSV and
            JSON export · retention set per plan · denials are recorded, not
            swallowed
          </p>
        </div>
      </div>
    </section>
  );
}
