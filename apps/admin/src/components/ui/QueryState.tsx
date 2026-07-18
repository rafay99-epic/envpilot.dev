import type { ReactNode } from "react";
import { TerminalLoading } from "./Spinner";
import { EmptyState } from "./EmptyState";

/**
 * The four-state wrapper for any data-driven section.
 *
 * States (checked in this order):
 *  1. error         — `error` is a non-empty string → readable message + "↻ Retry"
 *  2. notConfigured  — `notConfigured` provided → amber block naming the env var
 *  3. loading        — `data === undefined` → TerminalLoading (layout-stable)
 *  4. empty          — data is an empty array (or `empty.when` is true) → EmptyState
 *  5. ready          — otherwise render `children(data)`
 *
 * The caller decides configuration: pass `notConfigured` only when the env var
 * is actually missing, pass `error` only when a load failed.
 *
 * @example
 * <QueryState
 *   data={tickets}
 *   empty={{ command: "list tickets", message: "No tickets yet" }}
 *   error={errMsg}
 *   onRetry={refetch}
 *   notConfigured={{ envVar: "UMAMI_API_KEY", hint: "Set it on the Convex deployment" }}
 * >
 *   {(rows) => <TicketTable rows={rows} />}
 * </QueryState>
 */
interface QueryStateProps<T> {
  data: T | undefined;
  children: (data: T) => ReactNode;
  empty?: {
    command?: string;
    message: string;
    action?: { label: string; onClick: () => void };
    /** Force the empty state even when data is not an empty array. */
    when?: boolean;
  };
  error?: string | null;
  onRetry?: () => void;
  notConfigured?: { envVar: string; hint?: string };
  loadingLabel?: string;
}

export function QueryState<T>({
  data,
  children,
  empty,
  error,
  onRetry,
  notConfigured,
  loadingLabel,
}: QueryStateProps<T>) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
        <p className="font-mono text-sm text-red-400">
          <span className="text-zinc-500">$</span> error
        </p>
        <p className="mt-2 max-w-md text-sm text-zinc-400">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
          >
            <span aria-hidden>↻</span> Retry
          </button>
        )}
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
        <p className="font-mono text-sm text-amber-400">
          <span className="text-zinc-500">$</span> echo ${notConfigured.envVar}
        </p>
        <p className="mt-2 max-w-md text-sm text-zinc-400">
          <span className="font-mono text-amber-400">
            {notConfigured.envVar}
          </span>{" "}
          is not configured.
        </p>
        {notConfigured.hint && (
          <p className="mt-1 max-w-md text-xs text-zinc-500">
            {notConfigured.hint}
          </p>
        )}
      </div>
    );
  }

  if (data === undefined) {
    return <TerminalLoading label={loadingLabel} />;
  }

  const isEmpty =
    empty?.when === true || (Array.isArray(data) && data.length === 0);
  if (empty && isEmpty) {
    return (
      <EmptyState
        title={empty.message}
        command={empty.command}
        action={empty.action}
      />
    );
  }

  return <>{children(data)}</>;
}
