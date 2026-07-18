import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex/_generated/api";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TerminalLoading } from "@/components/ui/Spinner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { isLoading, user, signIn, signOut } = useAuth();
  const whoami = useAdminQuery(api.features.admin.auth.whoami, {});
  const navigate = useNavigate();

  const isAdmin = user && whoami?.isAdmin;
  useEffect(() => {
    if (isAdmin) navigate({ to: "/" });
  }, [isAdmin, navigate]);

  const pending = isLoading || (user && whoami === undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm">
        <p className="mb-3 text-center font-mono text-xs uppercase tracking-wider text-zinc-500">
          $ envpilot admin
        </p>
        <Card title="login">
          {pending ? (
            <TerminalLoading label="authenticating" />
          ) : user && whoami && !whoami.isAdmin ? (
            <div className="space-y-4 text-center">
              <p className="font-mono text-sm text-red-400">
                ✗ {whoami.email ?? "This account"} is not an admin.
              </p>
              <p className="text-xs text-zinc-500">
                If this email was just allowlisted, sign in to the main Envpilot
                app once first — admin access needs an existing Envpilot
                account.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void signOut()}
              >
                Sign out
              </Button>
            </div>
          ) : (
            <Button className="w-full" onClick={() => void signIn()}>
              Sign In with WorkOS
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
