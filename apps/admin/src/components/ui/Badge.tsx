import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-zinc-700 bg-zinc-800 text-zinc-400",
        success: "border-green-500/20 bg-green-500/10 text-green-400",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
        danger: "border-red-500/20 bg-red-500/10 text-red-400",
        info: "border-blue-500/20 bg-blue-500/10 text-blue-400",
        purple: "border-purple-500/20 bg-purple-500/10 text-purple-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant, className, children }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))}>
      {children}
    </span>
  );
}
