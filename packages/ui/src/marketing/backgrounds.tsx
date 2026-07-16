/**
 * Ambient background layers for marketing pages.
 * All server-safe (pure markup + CSS animations from globals.css).
 */

/** Soft drifting green aurora blobs. Place inside a `relative overflow-hidden` parent. */
export function AuroraGlow({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div
        className="absolute -top-1/4 left-1/2 h-[60rem] w-[60rem] -translate-x-1/2 rounded-full opacity-25"
        style={{
          background:
            "radial-gradient(closest-side, rgba(34,197,94,0.35), rgba(34,197,94,0.08) 55%, transparent 70%)",
          filter: "blur(60px)",
          animation: "aurora-drift 26s ease-in-out infinite",
        }}
      />
      <div
        className="absolute top-1/3 -left-40 h-[36rem] w-[36rem] rounded-full opacity-15"
        style={{
          background:
            "radial-gradient(closest-side, rgba(34,197,94,0.3), transparent 70%)",
          filter: "blur(80px)",
          animation: "aurora-drift 34s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute -right-40 top-2/3 h-[32rem] w-[32rem] rounded-full opacity-10"
        style={{
          background:
            "radial-gradient(closest-side, rgba(251,191,36,0.18), transparent 70%)",
          filter: "blur(90px)",
          animation: "aurora-drift 40s ease-in-out infinite",
          animationDelay: "-12s",
        }}
      />
    </div>
  );
}

/** Faint green blueprint grid, masked so it fades toward the edges. */
export function GridLines({
  className = "",
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(rgba(34,197,94,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.5) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        opacity: 0.05,
        maskImage:
          "radial-gradient(ellipse 80% 60% at 50% 35%, black 25%, transparent 80%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 60% at 50% 35%, black 25%, transparent 80%)",
        ...(animated ? { animation: "grid-pan 4s linear infinite" } : {}),
      }}
    />
  );
}

/** Film-grain overlay to kill flat-gradient banding. */
export function Noise({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 bg-noise ${className}`}
    />
  );
}

/** Thin glowing divider line between sections. */
export function GlowDivider({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative h-px w-full ${className}`}>
      <div className="absolute inset-0 bg-zinc-800/60" />
      <div
        className="absolute inset-y-0 left-1/2 w-1/3 -translate-x-1/2"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(34,197,94,0.5), transparent)",
        }}
      />
    </div>
  );
}
