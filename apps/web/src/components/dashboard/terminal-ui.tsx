import Link from "next/link";

const panel = "rounded-panel bg-surface ring-1 ring-line shadow-panel";

export function TerminalWindow({
  title,
  meta,
  cmd,
  action,
  children,
  className = "",
}: {
  title: string;
  meta?: string;
  cmd?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col overflow-hidden ${panel} ${className}`}>
      <div className="flex items-center gap-3 border-b border-line bg-white/[0.02] px-4 py-2">
        <span className="truncate font-mono text-[11.5px] text-ink-muted">
          {title}
        </span>
        {meta && (
          <span className="ml-auto hidden shrink-0 font-mono text-[11px] text-ink-faint sm:block">
            {meta}
          </span>
        )}
      </div>

      {cmd && (
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
          <span className="truncate font-mono text-xs text-ink-subtle">
            <span className="text-accent">$</span> {cmd}
          </span>
          {action && (
            <Link
              href={action.href}
              className="shrink-0 text-xs text-ink-subtle transition-colors hover:text-accent"
            >
              {action.label}
            </Link>
          )}
        </div>
      )}

      <div className="flex-1">{children}</div>
    </div>
  );
}

export function TerminalCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`${panel} p-6 ${className}`}>{children}</div>;
}

export function TerminalInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-panel border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder-ink-subtle transition-colors focus:border-accent-line focus:ring-1 focus:ring-accent-line focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function TerminalSelect({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-panel border border-line bg-surface-raised px-3 py-2 text-sm text-ink transition-colors focus:border-accent-line focus:ring-1 focus:ring-accent-line focus:outline-none ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger";

// Hover must differ from the resting fill, or nothing moves on pointer-over.
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-accent-line bg-accent-soft text-accent hover:bg-accent-line",
  secondary:
    "border-line text-ink-muted hover:border-line-strong hover:bg-surface-hover hover:text-ink",
  danger: "border-danger-line bg-danger-soft text-danger hover:bg-danger-line",
};

const buttonBase =
  "inline-flex items-center gap-2 rounded-panel border px-4 py-2 text-sm font-medium transition-colors";

export function TerminalButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={`${buttonBase} ${buttonVariants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function TerminalButtonLink({
  variant = "primary",
  className = "",
  children,
  href,
  hardNavigation = false,
  "data-testid": dataTestId,
}: {
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
  href: string;
  /** Plain anchor; a Link cannot follow a route handler's redirect. */
  hardNavigation?: boolean;
  "data-testid"?: string;
}) {
  const cls = `${buttonBase} ${buttonVariants[variant]} ${className}`;
  if (hardNavigation) {
    return (
      <a href={href} data-testid={dataTestId} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} data-testid={dataTestId} className={cls}>
      {children}
    </Link>
  );
}

const BADGE_COLORS = {
  green: "bg-accent-soft text-accent border-accent-line",
  amber: "bg-warning-soft text-warning border-warning-line",
  red: "bg-danger-soft text-danger border-danger-line",
  zinc: "bg-surface-raised text-ink-muted border-line",
  blue: "bg-info-soft text-info border-info-line",
  purple: "bg-premium-soft text-premium border-premium-line",
};

export function TerminalBadge({
  children,
  color = "green",
  className = "",
}: {
  children: React.ReactNode;
  color?: "green" | "amber" | "red" | "zinc" | "blue" | "purple";
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_COLORS[color]} ${className}`}
    >
      {children}
    </span>
  );
}

export function TerminalEmptyState({
  command,
  message,
  action,
}: {
  command: string;
  message: string;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="font-mono text-sm text-ink-subtle">
        <span className="text-accent">$</span> {command}
      </p>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>
      {action && (
        <div className="mt-4">
          {action.href ? (
            <TerminalButtonLink href={action.href} variant="primary">
              {action.label}
            </TerminalButtonLink>
          ) : (
            <TerminalButton variant="primary" onClick={action.onClick}>
              {action.label}
            </TerminalButton>
          )}
        </div>
      )}
    </div>
  );
}

export function TerminalLoading({ fullPage = false }: { fullPage?: boolean }) {
  return (
    <div
      className={
        fullPage
          ? "flex min-h-[60vh] items-center justify-center"
          : "flex items-center justify-center py-8"
      }
    >
      <span className="font-mono text-sm text-accent">
        <span className="text-ink-subtle">$</span> loading
        <span
          className="inline-block w-2 bg-accent"
          style={{ animation: "blink 1s step-end infinite" }}
        >
          &nbsp;
        </span>
      </span>
    </div>
  );
}
