import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("rounded-lg border border-zinc-800 bg-zinc-900 p-6", className)}>
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

export function StatCard({ title, value, icon, trend, className }: StatCardProps) {
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
