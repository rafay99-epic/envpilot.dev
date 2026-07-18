import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  /** Optional label rendered to the right of the toggle. */
  label?: string;
  className?: string;
  id?: string;
}

const SIZES = {
  sm: { track: "h-4 w-7", thumb: "h-3 w-3", travel: "translate-x-3" },
  md: { track: "h-5 w-9", thumb: "h-4 w-4", travel: "translate-x-4" },
} as const;

export function Switch({
  checked,
  onChange,
  disabled = false,
  size = "md",
  label,
  className,
  id,
}: SwitchProps) {
  const s = SIZES[size];
  const toggle = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex flex-shrink-0 items-center rounded-full border transition-colors",
        s.track,
        !label && className,
        checked
          ? "border-green-500/40 bg-green-500/30"
          : "border-zinc-700 bg-zinc-800",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      <span
        className={cn(
          "ml-0.5 inline-block transform rounded-full transition-transform",
          s.thumb,
          checked ? cn(s.travel, "bg-green-400") : "translate-x-0 bg-zinc-400"
        )}
      />
    </button>
  );

  if (!label) return toggle;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm text-zinc-300",
        disabled && "opacity-60",
        className
      )}
    >
      {toggle}
      {label}
    </span>
  );
}
