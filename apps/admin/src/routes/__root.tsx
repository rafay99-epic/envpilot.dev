import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

function RootErrorComponent({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-400" />
        <h1 className="text-xl font-semibold text-zinc-100">
          Something went wrong
        </h1>
        <p className="max-w-md text-sm text-zinc-500">
          {error.message || "An unexpected error occurred"}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          <RefreshCw className="h-4 w-4" />
          Reload
        </button>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-6xl font-bold text-zinc-700">404</h1>
        <p className="text-lg text-zinc-400">Page not found</p>
        <a
          href="/"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <ConfirmDialog />
    </>
  ),
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});
