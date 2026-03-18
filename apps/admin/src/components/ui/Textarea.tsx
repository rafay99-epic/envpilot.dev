import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ className, label, id, ...props }: TextareaProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cn(
          "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500",
          className
        )}
        {...props}
      />
    </div>
  );
}
