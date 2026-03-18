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
      className={`flex flex-col overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 shadow-xl ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
        <div className="h-3 w-3 rounded-full bg-[#ef5350]/80" />
        <div className="h-3 w-3 rounded-full bg-[#fbbf24]/80" />
        <div className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
        <span className="ml-2 text-xs text-zinc-500">{title}</span>
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
      className={`rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-6 ${className}`}
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
      className={`w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30 ${className}`}
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
      className={`rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20",
  secondary:
    "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20",
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
}: {
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
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
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
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
      <p className="font-mono text-sm text-zinc-500">
        <span className="text-green-400">$</span> {command}
      </p>
      <p className="mt-2 text-sm text-zinc-400">{message}</p>
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
      <span className="font-mono text-sm text-green-400">
        <span className="text-zinc-500">$</span> loading
        <span
          className="inline-block w-2 bg-green-400"
          style={{ animation: "blink 1s step-end infinite" }}
        >
          &nbsp;
        </span>
      </span>
    </div>
  );
}
