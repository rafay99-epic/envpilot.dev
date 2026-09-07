import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Card shell shared by the variables / accounts / files / docs trash lists.
export function TrashSection({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b px-6 py-4 border-line">
        <Icon className="h-4 w-4 text-ink-muted" />
        <h2 className="font-semibold text-ink">{title}</h2>
        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-surface-raised text-ink-muted">
          {count}
        </span>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}
