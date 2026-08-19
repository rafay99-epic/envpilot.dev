import { AuthProvider } from "@/components/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadDashboardAuth } from "@/lib/dashboard-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Deliberately NOT awaited. Awaiting here put the session lookup, the Convex
  // user sync and three more Convex queries in front of the first byte of
  // every dashboard route, which is what made all ~30 of them render on
  // demand. Handing the promise to AuthProvider instead lets the shell
  // prerender: the sidebar and chrome paint on click and the session streams
  // in behind them. Routing is already gated by proxy.ts, so nothing here is
  // the thing keeping a signed-out visitor out.
  const authPromise = loadDashboardAuth();

  return (
    <AuthProvider authPromise={authPromise}>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
