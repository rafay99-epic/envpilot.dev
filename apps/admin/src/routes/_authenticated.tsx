import { createFileRoute, redirect } from "@tanstack/react-router";
import { Layout } from "@/components/layout/Layout";
import { useAuthStore } from "@/stores/auth-store";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: "/login" });
    }
  },
  component: Layout,
});
