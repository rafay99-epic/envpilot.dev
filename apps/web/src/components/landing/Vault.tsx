import { TerminalCommand, terminal } from "@/components/marketing";

const ITEMS = [
  {
    kind: "variables",
    count: "47",
    title: "The ones that fit on a line",
    body: "Same key, different value per environment, and every write keeps its history. Roll back to any prior value. Set a lifetime and get mailed before it expires.",
    keys: [
      "DATABASE_URL",
      "STRIPE_SECRET_KEY",
      "REDIS_TLS_URL",
      "SENTRY_DSN",
      "+ 43 more",
    ],
  },
  {
    kind: "files",
    count: "3",
    title: "The ones that never did",
    body: "Keystores, service-account JSON, SSH keys, certificates. Envelope-encrypted with a per-file data key, written to the path they belong at, never to the repo.",
    keys: ["service-account.json", "id_ed25519", "fullchain.pem"],
  },
  {
    kind: "accounts",
    count: "2",
    title: "The ones in the group chat",
    body: "Shared logins for the dashboards that never shipped an API. Same roles, same audit trail, same revoke button as everything else in here.",
    keys: ["grafana · ops@acme.dev", "postmark · billing@acme.dev"],
  },
  {
    kind: "docs",
    count: "8",
    title: "The ones explaining the rest",
    body: "Markdown pages living beside the secrets they describe. An agent can draft the runbook over MCP; shipping it needs a human holding project.docs.publish.",
    keys: ["runbook/deploys", "rotate-stripe-keys", "+ 6 more"],
  },
];

export function Vault() {
  return (
    <section id="features" className="scroll-mt-24 py-24 sm:py-28">
      <div className={terminal.shell}>
        <TerminalCommand
          cmd="envpilot vault --describe"
          comment="four things live in here. only one of them is a .env file."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {ITEMS.map((item) => (
            <div
              key={item.kind}
              className={`${terminal.panel} flex flex-col p-6`}
            >
              <div className="flex items-baseline gap-3">
                <span
                  className={`${terminal.mono} text-[11px] tracking-[0.16em] text-accent uppercase`}
                >
                  {item.kind}
                </span>
                <span
                  className={`${terminal.mono} ml-auto text-[13px] text-ink-faint`}
                >
                  {item.count}
                </span>
              </div>
              <h3 className="mt-4 font-sans text-lg font-semibold tracking-[-0.02em] text-ink">
                {item.title}
              </h3>
              <p className="mt-2.5 font-sans text-[15px] leading-relaxed text-ink-muted">
                {item.body}
              </p>
              <div
                className={`mt-5 space-y-1 border-t ${terminal.line} pt-4 ${terminal.mono} text-[12px] text-ink-subtle`}
              >
                {item.keys.map((key) => (
                  <p key={key} className="truncate">
                    <span aria-hidden className="mr-2 text-ink-faint">
                      ·
                    </span>
                    {key}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
