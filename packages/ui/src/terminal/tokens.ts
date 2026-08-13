// Panel identity is the same string the dashboard chrome uses
// (apps/web/src/components/dashboard/terminal-ui.tsx), so marketing pages,
// sub-pages and the app render the same surface.
export const terminal = {
  shell: "mx-auto w-full max-w-5xl px-6",
  line: "border-line",
  panel: "rounded-panel bg-surface ring-1 ring-line shadow-panel",
  mono: "font-mono",
  cta: "inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 font-sans text-[15px] font-semibold text-chrome shadow-[0_0_32px_-10px_rgba(34,197,94,0.9)] transition-colors hover:bg-accent-hover",
  ctaGhost:
    "inline-flex items-center gap-2 rounded-md px-6 py-3 font-sans text-[15px] text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong",
  input:
    "w-full rounded-panel border border-line bg-surface-raised px-3.5 py-2.5 font-sans text-[15px] text-ink placeholder-ink-faint transition-colors focus:border-accent-line focus:ring-1 focus:ring-accent-line focus:outline-none",
  label: "font-mono text-[12px] text-ink-subtle",
} as const;
