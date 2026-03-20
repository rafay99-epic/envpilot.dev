export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      {/* Envpilot branding */}
      <div className="mb-8">
        <span className="font-mono text-xl font-bold text-green-500">
          envpilot
        </span>
      </div>
      {children}
      <p className="mt-8 text-xs text-zinc-600">
        Secure secret sharing powered by Envpilot
      </p>
    </div>
  );
}
