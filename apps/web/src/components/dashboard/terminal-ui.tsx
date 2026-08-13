import Link from "next/link";

export function TerminalWindow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-line bg-surface/90 shadow-xl ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-line bg-surface-raised/80 px-4 py-2.5">
        <div className="h-3 w-3 rounded-full bg-[#ef5350]/80" />
        <div className="h-3 w-3 rounded-full bg-[#fbbf24]/80" />
        <div className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
        <span className="ml-2 text-xs text-ink-subtle">{title}</span>
      </div>
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
  return (
    <div
      className={`rounded-lg border border-line bg-surface/90 p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function TerminalInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder-ink-subtle focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line ${className}`}
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
      className={`rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-accent-line bg-accent-soft text-accent hover:bg-accent-soft",
  secondary:
    "border-line text-ink-muted hover:border-line-strong hover:text-ink-muted",
  danger: "border-danger-line bg-danger-soft text-danger hover:bg-danger-soft",
};

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
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${buttonVariants[variant]} ${className}`}
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
  "data-testid": dataTestId,
}: {
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
  href: string;
  "data-testid"?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={dataTestId}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${buttonVariants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function TerminalBadge({
  children,
  color = "green",
  className = "",
}: {
  children: React.ReactNode;
  color?: "green" | "amber" | "red" | "zinc" | "blue" | "purple";
  className?: string;
}) {
  const colors = {
    green: "bg-accent-soft text-accent border-accent-line",
    amber: "bg-warning-soft text-warning border-warning-line",
    red: "bg-danger-soft text-danger border-danger-line",
    zinc: "bg-surface-raised text-ink-muted border-line",
    blue: "bg-info-soft text-info border-info-line",
    purple: "bg-premium-soft text-premium border-premium-line",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[color]} ${className}`}
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
