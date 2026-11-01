import { AuthProvider } from "@/components/auth";
import { ConvexAuthProvider } from "@/components/ConvexClientProvider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadDashboardAuth } from "@/lib/dashboard-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authPromise = loadDashboardAuth();

  return (
    <ConvexAuthProvider>
      <AuthProvider authPromise={authPromise}>
        <DashboardShell>{children}</DashboardShell>
      </AuthProvider>
    </ConvexAuthProvider>
  );
}
