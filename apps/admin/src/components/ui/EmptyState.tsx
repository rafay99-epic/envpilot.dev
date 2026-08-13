import { Button } from "./Button";

interface EmptyStateProps {
  /** Optional lucide icon; only shown when no `command` is given. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Terminal command line rendered as `$ <command>` in mono green. */
  command?: string;
  /** Optional call-to-action button. */
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  icon,
  title,
  description,
  command,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
      {command ? (
        <p className="font-mono text-sm text-ink-subtle">
          <span className="text-accent">$</span> {command}
        </p>
      ) : (
        icon && <div className="mb-3 text-ink-faint">{icon}</div>
      )}
      <p className="mt-2 text-sm text-ink-muted">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-ink-subtle">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          <Button onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  );
}
