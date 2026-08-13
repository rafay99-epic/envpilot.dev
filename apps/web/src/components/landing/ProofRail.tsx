import { SITE_URLS, terminal } from "@/components/marketing";
import { APP_VERSIONS } from "@/lib/versions";

const PROOF = [
  { strong: "MIT", label: "read the source", href: SITE_URLS.github },
  {
    strong: "npm",
    label: `@envpilot/cli v${APP_VERSIONS.cli}`,
    href: "https://www.npmjs.com/package/@envpilot/cli",
  },
  {
    strong: "vsce",
    label: `extension v${APP_VERSIONS.extension}`,
    href: "https://marketplace.visualstudio.com/items?itemName=envpilot.envpilot",
  },
  {
    strong: "gha",
    label: "envpilot-action@v1",
    href: "https://github.com/rafay99-epic/envpilot-action",
  },
  { strong: "log", label: "changelog", href: "/changelog" },
];

export function ProofRail() {
  return (
    <div className={`border-y ${terminal.line} bg-white/[0.015]`}>
      <div
        className={`${terminal.shell} flex flex-wrap items-center gap-x-7 gap-y-2 py-3.5`}
      >
        {PROOF.map((item) => {
          const external = !item.href.startsWith("/");

          return (
            <a
              key={item.strong}
              href={item.href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className={`${terminal.mono} text-[12px] text-ink-subtle transition-colors hover:text-ink`}
            >
              <span className="text-accent/80">{item.strong}</span> {item.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
