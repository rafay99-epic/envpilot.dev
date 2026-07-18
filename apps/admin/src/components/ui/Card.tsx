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
          "flex flex-col overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 shadow-xl",
          className
        )}
      >
        <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-[#ef5350]/80" />
          <span className="h-3 w-3 rounded-full bg-[#fbbf24]/80" />
          <span className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
          <span className="ml-2 text-xs text-zinc-500">{title}</span>
        </div>
        <div className="flex-1 p-6">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-6",
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
        <p className="text-sm text-zinc-400">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
        {trend && <p className="mt-1 text-xs text-zinc-500">{trend}</p>}
      </div>
      {icon && <div className="text-zinc-500">{icon}</div>}
    </Card>
  );
}
