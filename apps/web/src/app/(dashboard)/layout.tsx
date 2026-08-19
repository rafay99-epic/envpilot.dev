import { AuthProvider } from "@/components/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadDashboardAuth } from "@/lib/dashboard-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authPromise = loadDashboardAuth();

  return (
    <AuthProvider authPromise={authPromise}>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
