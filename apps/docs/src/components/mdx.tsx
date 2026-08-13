import type { ReactNode } from "react";
import { Info, TriangleAlert, ShieldAlert, Lightbulb } from "lucide-react";

const CALLOUT_STYLES = {
  info: {
    icon: Info,
    wrapper: "border-info-line bg-info-soft",
    label: "text-info",
  },
  tip: {
    icon: Lightbulb,
    wrapper: "border-accent-line bg-accent-soft",
    label: "text-accent",
  },
  warning: {
    icon: TriangleAlert,
    wrapper: "border-warning-line bg-warning-soft",
    label: "text-warning",
  },
  danger: {
    icon: ShieldAlert,
    wrapper: "border-danger-line bg-danger-soft",
    label: "text-danger",
  },
} as const;

/**
 * Callout — the one way docs raise their voice.
 *
 * `<Callout type="danger" title="Never commit this">…</Callout>`
 */
export function Callout({
  type = "info",
  title,
  children,
}: {
  type?: keyof typeof CALLOUT_STYLES;
  title?: string;
  children: ReactNode;
}) {
  const style = CALLOUT_STYLES[type] ?? CALLOUT_STYLES.info;
  const Icon = style.icon;

  return (
    <div className={`my-6 rounded-xl border px-5 py-4 ${style.wrapper}`}>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.label}`} />
        <div className="min-w-0 flex-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          {title && (
            <p
              className={`mb-1 font-mono text-xs uppercase tracking-widest ${style.label}`}
            >
              {title}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Steps — numbered walkthrough. Each `###` heading inside becomes a step,
 * numbered by CSS counters so reordering never renumbers by hand.
 */
export function Steps({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 border-l border-line pl-6 [counter-reset:step] [&_h3]:relative [&_h3]:[counter-increment:step] before:[&_h3]:absolute before:[&_h3]:-left-[2.1rem] before:[&_h3]:flex before:[&_h3]:h-6 before:[&_h3]:w-6 before:[&_h3]:items-center before:[&_h3]:justify-center before:[&_h3]:rounded-full before:[&_h3]:border before:[&_h3]:border-accent-line before:[&_h3]:bg-canvas before:[&_h3]:font-mono before:[&_h3]:text-[11px] before:[&_h3]:text-accent before:[&_h3]:content-[counter(step)]">
      {children}
    </div>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: "border-accent-line bg-accent-soft text-accent",
  POST: "border-info-line bg-info-soft text-info",
  PATCH: "border-warning-line bg-warning-soft text-warning",
  DELETE: "border-danger-line bg-danger-soft text-danger",
};

/**
 * Endpoint — the header block for one REST route: method, path, and the
 * API-key resource it demands.
 */
export function Endpoint({
  method = "GET",
  path,
  resource,
  auth = "API key",
}: {
  method?: string;
  path: string;
  resource?: string;
  auth?: string;
}) {
  const color =
    METHOD_COLORS[method.toUpperCase()] ??
    "border-line bg-surface text-ink-muted";

  return (
    <div className="my-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/40 px-4 py-3">
      <span
        className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider ${color}`}
      >
        {method.toUpperCase()}
      </span>
      <code className="font-mono text-sm text-ink">{path}</code>
      <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint">
        <span>{auth}</span>
        {resource && (
          <span className="rounded border border-line px-1.5 py-0.5 text-ink-muted">
            {resource}
          </span>
        )}
      </span>
    </div>
  );
}
