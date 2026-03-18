import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const convex = useConvex();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await convex.query(api.admin.verifySecret, { secret: password });
      if (result.valid) {
        login(password);
        navigate({ to: "/" });
      } else {
        setError("Invalid admin secret");
      }
    } catch {
      setError("Failed to verify secret. Check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
            E
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">Envpilot Admin</h1>
          <p className="mt-1 text-sm text-zinc-500">Enter your admin secret to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Admin secret"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading || !password}>
            {isLoading ? "Verifying..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
