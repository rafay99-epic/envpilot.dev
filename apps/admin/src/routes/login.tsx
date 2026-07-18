import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex/_generated/api";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

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
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
            E
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Envpilot Admin
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in with your Envpilot account
          </p>
        </div>

        {pending ? (
          <div className="flex justify-center">
            <Spinner />
          </div>
        ) : user && whoami && !whoami.isAdmin ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-red-400">
              {whoami.email ?? "This account"} is not an admin.
            </p>
            <Button className="w-full" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => void signIn()}>
            Sign In with WorkOS
          </Button>
        )}
      </div>
    </div>
  );
}
