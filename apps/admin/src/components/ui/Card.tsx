import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /**
   * When set, renders a terminal window title-bar (three colored dots +
   * the title) above the content. Omit for a plain terminal card.
   */
  title?: string;
}

export function Card({ children, className, title }: CardProps) {
  if (title) {
    return (
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-lg border border-line bg-surface/90 shadow-xl",
          className
        )}
      >
        <div className="flex items-center gap-2 border-b border-line bg-surface-raised/80 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-danger/80" />
          <span className="h-3 w-3 rounded-full bg-warning/80" />
          <span className="h-3 w-3 rounded-full bg-accent/80" />
          <span className="ml-2 text-xs text-ink-subtle">{title}</span>
        </div>
        <div className="flex-1 p-6">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface/90 p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("flex items-start justify-between", className)}>
      <div>
        <p className="text-sm text-ink-muted">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
        {trend && <p className="mt-1 text-xs text-ink-subtle">{trend}</p>}
      </div>
      {icon && <div className="text-ink-subtle">{icon}</div>}
    </Card>
  );
}
