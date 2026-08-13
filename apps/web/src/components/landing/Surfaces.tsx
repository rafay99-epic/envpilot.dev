import {
  TerminalCommand,
  TerminalPanel,
  TerminalTabs,
  terminal,
} from "@/components/marketing";

type Tone = "cmd" | "ok" | "dim" | "val";

interface Surface {
  id: string;
  label: string;
  body: string;
  lines: { text: string; tone: Tone }[];
  note: string;
}

const SURFACES: Surface[] = [
  {
    id: "cli",
    label: "cli",
    body: "Link a directory once, then run anything with its secrets already in the environment. Nothing lands on disk, so nothing leaks after the process exits.",
    lines: [
      { text: "❯ envpilot init", tone: "cmd" },
      { text: "✓ linked backend-api / staging", tone: "ok" },
      { text: "❯ envpilot run -- bun dev", tone: "cmd" },
      { text: "✓ 47 variables injected into process env", tone: "ok" },
    ],
    note: "pull · push · diff · switch · files · request",
  },
  {
    id: "vscode",
    label: "vscode",
    body: "Sign in once and every linked folder stays current over a live connection. When access is revoked the local files are removed — not left stale on a laptop.",
    lines: [
      { text: "> Envpilot: Link Project", tone: "cmd" },
      { text: "> Envpilot: Pull Variables", tone: "cmd" },
      { text: "> Envpilot: Select Environments", tone: "cmd" },
      { text: "> Envpilot: Request Variable", tone: "cmd" },
    ],
    note: "real-time sync · multi-directory · cleanup on revoke",
  },
  {
    id: "web",
    label: "dashboard",
    body: "Where the decisions happen: who sees what, which request is approved, which value gets rolled back, and what the auditor is sent.",
    lines: [
      { text: "/ projects & environments", tone: "dim" },
      { text: "/ variables, files & shared accounts", tone: "dim" },
      { text: "/ roles, requests & security hold", tone: "dim" },
      { text: "/ audit log & compliance export", tone: "dim" },
    ],
    note: "approve · roll back · export · hold",
  },
  {
    id: "action",
    label: "actions",
    body: "Pull the environment a job needs with a read-only key scoped to that project alone. Values are masked before anything is exported, so they never reach a log.",
    lines: [
      { text: "- uses: rafay99-epic/envpilot-action@v1", tone: "cmd" },
      { text: "  with:", tone: "dim" },
      { text: "    token: ${{ secrets.ENVPILOT_TOKEN }}", tone: "val" },
      { text: "    environment: production", tone: "val" },
    ],
    note: "masked before export · read-only · revocable",
  },
  {
    id: "api",
    label: "rest",
    body: "One authorization core serves every surface, so an internal script gets the same scoping, the same tier gate, and the same audit row as the dashboard.",
    lines: [
      { text: "❯ curl -H 'Authorization: Bearer envpk_…' \\", tone: "cmd" },
      {
        text: "    envpilot.dev/api/v1/secrets?environment=production",
        tone: "cmd",
      },
      { text: "✓ 200 — 32 variables, active only", tone: "ok" },
    ],
    note: "project & resource scopes · bounded reads · never partial",
  },
  {
    id: "mcp",
    label: "mcp",
    body: "Give Claude, Codex, or Cursor the projects you approve and nothing else. The agent holds a scoped key, and every tool call it makes lands in the same log you read.",
    lines: [
      { text: '"envpilot": {', tone: "cmd" },
      { text: '  "url": "https://www.envpilot.dev/api/mcp",', tone: "val" },
      {
        text: '  "headers": { "Authorization": "Bearer envpk_…" }',
        tone: "val",
      },
      { text: "}", tone: "cmd" },
    ],
    note: "scoped keys · every call audited · no .env in the repo",
  },
];

const TONES: Record<Tone, string> = {
  cmd: "text-ink",
  ok: "text-accent",
  dim: "text-ink-subtle",
  val: "text-ink-muted",
};

function SurfacePanel({ surface }: { surface: Surface }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-center">
      <div>
        <p className="font-sans text-[17px] leading-relaxed text-ink-muted">
          {surface.body}
        </p>
        <p className={`mt-5 ${terminal.mono} text-[12px] text-ink-subtle`}>
          {surface.note}
        </p>
      </div>

      <TerminalPanel>
        <div
          className={`overflow-x-auto ${terminal.mono} text-[13px] leading-[1.95]`}
        >
          {surface.lines.map((line) => (
            <p key={line.text} className={`whitespace-pre ${TONES[line.tone]}`}>
              {line.text}
            </p>
          ))}
        </div>
      </TerminalPanel>
    </div>
  );
}

export function Surfaces() {
  return (
    <section
      id="integrations"
      className={`scroll-mt-24 border-y ${terminal.line} bg-white/[0.015] py-24 sm:py-28`}
    >
      <div className={terminal.shell}>
        <TerminalCommand
          cmd="envpilot surfaces --list"
          comment="one scoped key. the denial an agent gets is the denial CI gets."
        />

        <TerminalTabs
          className="mt-12"
          label="Envpilot surfaces"
          items={SURFACES.map((surface) => ({
            id: surface.id,
            label: surface.label,
            panel: <SurfacePanel surface={surface} />,
          }))}
        />
      </div>
    </section>
  );
}
