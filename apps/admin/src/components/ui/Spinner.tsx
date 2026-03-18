import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-8", className)}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
    </div>
  );
}
