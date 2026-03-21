"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import {
  TerminalWindow,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { Check, Sparkles, ArrowRight, Crown } from "lucide-react";

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const checkoutId = searchParams.get("checkout_id");
  const confettiFired = useRef(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    // Small delay so the page renders before confetti fires
    const timer = setTimeout(() => setShowContent(true), 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (showContent && !confettiFired.current) {
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
  }, [showContent]);

  if (!showContent) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <TerminalWindow title="processing">
          <TerminalLoading />
        </TerminalWindow>
      </div>
    );
  }

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
                <span className="text-zinc-500">checkout_id:</span>{" "}
                {checkoutId}
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
