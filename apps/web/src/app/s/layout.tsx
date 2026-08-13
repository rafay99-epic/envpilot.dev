export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4">
      {/* Envpilot branding */}
      <div className="mb-8">
        <span className="font-mono text-xl font-bold text-accent">
          envpilot
        </span>
      </div>
      {children}
      <p className="mt-8 text-xs text-ink-faint">
        Secure secret sharing powered by Envpilot
      </p>
    </div>
  );
}
