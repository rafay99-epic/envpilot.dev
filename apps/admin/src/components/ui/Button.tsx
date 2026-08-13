import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // primary — green tint
        default:
          "border-accent-line bg-accent-soft text-accent hover:bg-accent-soft",
        // danger — red tint
        destructive:
          "border-danger-line bg-danger-soft text-danger hover:bg-danger-soft",
        // secondary — zinc outline
        outline:
          "border-line bg-transparent text-ink-muted hover:border-line-strong hover:text-ink-muted",
        ghost:
          "border-transparent text-ink-muted hover:bg-accent-soft hover:text-accent",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-10 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
