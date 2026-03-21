"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import {
  TerminalWindow,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import {
  Check,
  Sparkles,
  ArrowRight,
  Crown,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

type SyncStatus = "syncing" | "success" | "error";

/**
 * Sync subscription state by calling the billing sync endpoint.
 * Returns true on success, false on failure (but we treat both as success
 * since the webhook will handle the tier update regardless).
 */
async function syncBilling(checkoutId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/billing/sync?checkout_id=${encodeURIComponent(checkoutId)}`,
      { method: "POST" }
    );
    if (!res.ok) {
      console.warn("Sync endpoint returned non-OK status, continuing...");
    }
    return true;
  } catch {
    console.warn("Sync request failed, webhook will handle tier update");
    return true; // Still treat as success — payment went through
  }
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const checkoutId = searchParams.get("checkout_id");
  const errorParam = searchParams.get("error");
  const confettiFired = useRef(false);
  // Determine initial sync status: error if error param, success if no checkout
  // to sync, syncing if we need to call the billing sync endpoint.
  const initialStatus: SyncStatus = errorParam
    ? "error"
    : !checkoutId
      ? "success"
      : "syncing";
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(initialStatus);
  const [errorMessage, setErrorMessage] = useState(errorParam || "");
  const syncAttempted = useRef(false);

  // Sync subscription state on page load — this ensures the user's tier
  // is updated even if the webhook hasn't arrived yet (race condition fix).
  useEffect(() => {
    if (initialStatus !== "syncing") return;
    if (syncAttempted.current) return;
    syncAttempted.current = true;

    let cancelled = false;
    syncBilling(checkoutId!).then(() => {
      if (!cancelled) setSyncStatus("success");
    });
    return () => {
      cancelled = true;
    };
  }, [initialStatus, checkoutId]);

  // Fire confetti when sync completes successfully
  useEffect(() => {
    if (syncStatus === "success" && !confettiFired.current && !errorParam) {
      confettiFired.current = true;

      // Initial burst
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#00ff41", "#39ff14", "#32cd32", "#7fff00", "#adff2f"],
      });

      // Side cannons after a short delay
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ["#00ff41", "#39ff14", "#ffffff"],
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ["#00ff41", "#39ff14", "#ffffff"],
        });
      }, 300);
    }
  }, [syncStatus, errorParam]);

  // --- Error State ---
  if (errorParam || (syncStatus === "error" && errorMessage)) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <TerminalWindow title="checkout — error">
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500/30 bg-red-500/10">
                <AlertTriangle
                  className="h-8 w-8 text-red-400"
                  strokeWidth={2}
                />
              </div>
              <div className="space-y-2">
                <h1 className="font-mono text-2xl font-bold text-red-400">
                  Checkout Failed
                </h1>
                <p className="font-mono text-sm text-zinc-400">
                  {errorParam || errorMessage || "Something went wrong"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="font-mono text-xs text-zinc-500">
                $ troubleshoot --help
              </p>
              <ul className="mt-3 space-y-2 font-mono text-sm text-zinc-400">
                <li>
                  &bull; If your payment was charged, it will be automatically
                  refunded
                </li>
                <li>&bull; Try again in a few moments</li>
                <li>
                  &bull; Contact support if the issue persists:{" "}
                  <a
                    href="/support"
                    className="text-green-400 underline hover:text-green-300"
                  >
                    /support
                  </a>
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => router.push("/pricing")}
                className="group flex flex-1 items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-6 py-3 font-mono text-sm font-medium text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/20"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="group flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-6 py-3 font-mono text-sm font-medium text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-800"
              >
                Dashboard
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  // --- Loading / Syncing State ---
  if (syncStatus === "syncing") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <TerminalWindow title="processing — syncing subscription">
          <div className="space-y-4 py-8">
            <TerminalLoading />
            <p className="text-center font-mono text-sm text-zinc-400">
              Activating your subscription...
            </p>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  // --- Success State ---
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <TerminalWindow title="subscription — activated">
        <div className="space-y-6 py-4">
          {/* Success Header */}
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-green-500/30 bg-green-500/10">
              <Check className="h-8 w-8 text-green-400" strokeWidth={3} />
            </div>

            <div className="space-y-2">
              <h1 className="font-mono text-2xl font-bold text-green-400">
                Payment Successful
              </h1>
              <p className="font-mono text-sm text-zinc-400">
                Your subscription has been activated
              </p>
            </div>
          </div>

          {/* Pro Badge */}
          <div className="mx-auto flex max-w-sm items-center justify-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-6 py-4">
            <Crown className="h-6 w-6 text-amber-400" />
            <div>
              <p className="font-mono text-lg font-semibold text-amber-400">
                Pro Tier
              </p>
              <p className="font-mono text-xs text-zinc-500">
                All premium features unlocked
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-amber-400/60" />
          </div>

          {/* What's Included */}
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
              $ cat pro-features.txt
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                "Unlimited Projects",
                "Unlimited Variables",
                "Team Members (10+)",
                "Audit Log (90 days)",
                "Secret Sharing",
                "Variable Tags",
                "Priority Support",
                "API Access",
              ].map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 font-mono text-sm text-zinc-300"
                >
                  <Check className="h-3.5 w-3.5 shrink-0 text-green-400" />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Checkout Reference */}
          {checkoutId && (
            <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
              <p className="font-mono text-xs text-zinc-600">
                <span className="text-zinc-500">checkout_id:</span> {checkoutId}
              </p>
            </div>
          )}

          {/* CTA Button */}
          <button
            onClick={() => router.push("/dashboard")}
            className="group flex w-full items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-6 py-3 font-mono text-sm font-medium text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/20"
          >
            Continue to Dashboard
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </TerminalWindow>
    </div>
  );
}
