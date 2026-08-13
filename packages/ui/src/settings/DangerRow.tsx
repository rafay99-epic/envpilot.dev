import type { ReactNode } from "react";

/**
 * Destructive action: red label, red hairline, red button — never a red card.
 * `consequences` is the part people actually need; spell out what the action
 * does to secrets and access rather than relying on the word "permanent".
 */
export function DangerRow({
  title,
  description,
  consequences,
  action,
}: {
  title: string;
  description?: ReactNode;
  consequences?: string[];
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-danger-line/40 py-6 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-danger">{title}</p>
        {description && (
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-subtle">
            {description}
          </p>
        )}
        {consequences && consequences.length > 0 && (
          <ul className="mt-2 space-y-1">
            {consequences.map((line) => (
              <li
                key={line}
                className="flex gap-2 text-[13px] leading-relaxed text-ink-subtle"
              >
                <span aria-hidden className="font-mono text-danger">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
