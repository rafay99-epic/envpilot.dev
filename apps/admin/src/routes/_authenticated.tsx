import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex/_generated/api";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { Layout } from "@/components/layout/Layout";
import { TerminalLoading } from "@/components/ui/Spinner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

/**
 * Client-side gate only (UX). The real enforcement is requireAdmin() inside
 * every Convex function — a non-admin who bypasses this sees only errors.
 */
function AuthGate() {
  const { isLoading, user } = useAuth();
  const whoami = useAdminQuery(api.features.admin.auth.whoami, {});

  if (isLoading || (user && whoami === undefined)) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <TerminalLoading label="authenticating" fullPage />
      </div>
    );
  }
  if (!user || !whoami?.isAdmin) {
    return <Navigate to="/login" />;
  }
  return <Layout />;
}
