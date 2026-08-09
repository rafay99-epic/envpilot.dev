import {
  TerminalCommand,
  TerminalPanel,
  TerminalTable,
  terminal,
  type TerminalColumn,
} from "@/components/marketing";

const ROLES = ["owner", "manager", "lead", "editor", "dev", "viewer"];

const COLUMNS: TerminalColumn[] = [
  { key: "capability", label: "capability" },
  ...ROLES.map((role) => ({
    key: role,
    label: role,
    align: "center" as const,
  })),
];

const MATRIX: { cap: string; grants: boolean[] }[] = [
  { cap: "project.read", grants: [true, true, true, true, true, true] },
  {
    cap: "project.variables.create",
    grants: [true, true, true, true, true, false],
  },
  {
    cap: "project.variables.update",
    grants: [true, true, true, true, false, false],
  },
  {
    cap: "project.secrets.reveal",
    grants: [true, true, true, true, false, false],
  },
  {
    cap: "project.docs.publish",
    grants: [true, true, true, true, false, false],
  },
  { cap: "project.share", grants: [true, true, true, false, true, false] },
  {
    cap: "project.requests.review",
    grants: [true, true, true, false, false, false],
  },
  {
    cap: "project.permissions.manage",
    grants: [true, true, true, false, false, false],
  },
  { cap: "org.audit.view", grants: [true, true, true, false, false, false] },
  { cap: "org.billing", grants: [true, false, false, false, false, false] },
];

const NOTES = [
  {
    t: "Request, don't ask",
    d: "A developer requests a variable instead of posting in a channel. The approval is the grant, and the request is the record.",
  },
  {
    t: "Rotation on a calendar",
    d: "Give a secret a lifetime and the clock is watched hourly, so rotation happens on a schedule instead of during an incident.",
  },
  {
    t: "Hold, don't delete",
    d: "Suspend a member across dashboard, CLI, extension, and API with one switch — permissions intact, history intact.",
  },
];

const ROWS = MATRIX.map((row) => ({
  key: row.cap,
  cells: [
    <span key="cap" className="text-zinc-300">
      {row.cap}
    </span>,
    ...row.grants.map((granted, i) => (
      <span
        key={ROLES[i]}
        role="img"
        aria-label={granted ? "granted" : "not granted"}
        className={granted ? "text-green-400" : "text-zinc-700"}
      >
        {granted ? "✓" : "·"}
      </span>
    )),
  ],
}));

export function Access() {
  return (
    <section id="access" className="scroll-mt-24 py-24 sm:py-28">
      <div className={terminal.shell}>
        <TerminalCommand
          cmd="envpilot whoami --capabilities"
          comment="no feature in this codebase compares a role name. it asks the catalog."
        />

        <div className="mt-12">
          <TerminalPanel
            title="roleRegistry — 6 roles, 41 capabilities"
            meta="10 of 41 shown"
            bodyClassName="p-0"
          >
            <TerminalTable columns={COLUMNS} rows={ROWS} minWidth={640} />
          </TerminalPanel>

          <div className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <p className="font-sans text-[15px] leading-relaxed text-zinc-400">
              <span className="text-zinc-200">Look at the share row.</span>{" "}
              Developers can share a secret; editors cannot. No invented ladder
              produces that — it is the real profile, and it is editable. Roles
              are data; capabilities are code.
            </p>
            <p className="font-sans text-[15px] leading-relaxed text-zinc-400">
              <span className="text-zinc-200">
                The owner column is derived,
              </span>{" "}
              never hand-written — so a capability shipped on Tuesday cannot
              lock an owner out of their own organization on Wednesday. A test
              pins it.
            </p>
          </div>

          <div
            className={`mt-10 grid gap-px overflow-hidden ${terminal.panel} sm:grid-cols-3`}
          >
            {NOTES.map((item) => (
              <div key={item.t} className="bg-[#0B0D0C] p-6">
                <h3 className="font-sans text-[15px] font-semibold text-zinc-100">
                  {item.t}
                </h3>
                <p className="mt-2 font-sans text-[14px] leading-relaxed text-zinc-400">
                  {item.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
