import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-8", className)}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-green-500" />
    </div>
  );
}

/**
 * Terminal-style loading indicator: `$ loading` in mono green with a blinking
 * cursor. The `blink` animation is globally disabled under
 * prefers-reduced-motion (see app.css).
 */
export function TerminalLoading({
  label = "loading",
  fullPage = false,
}: {
  label?: string;
  fullPage?: boolean;
}) {
  return (
    <div
      className={
        fullPage
          ? "flex min-h-[60vh] items-center justify-center"
          : "flex items-center justify-center py-8"
      }
    >
      <span className="font-mono text-sm text-green-400">
        <span className="text-zinc-500">$</span> {label}
        <span
          className="inline-block w-2 bg-green-400"
          style={{ animation: "blink 1s step-end infinite" }}
        >
          &nbsp;
        </span>
      </span>
    </div>
  );
}
