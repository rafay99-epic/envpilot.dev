"use client";

import { CheckCircle } from "lucide-react";
import { terminal } from "@/components/marketing";

export function TicketSubmitted({
  email,
  onReset,
}: {
  email: string;
  onReset: () => void;
}) {
  return (
    <div className="py-10 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft ring-1 ring-accent-line">
        <CheckCircle className="h-7 w-7 text-accent" />
      </span>
      <h2 className="mt-5 font-sans text-[20px] font-semibold tracking-[-0.02em] text-ink">
        Ticket submitted
      </h2>
      <p className="mx-auto mt-3 max-w-md font-sans text-[15px] leading-relaxed text-ink-muted">
        We&apos;ve received your request and will reply at{" "}
        <span className={`${terminal.mono} text-accent`}>{email}</span>.
      </p>
      <button
        onClick={onReset}
        className="mt-7 rounded-md px-5 py-2.5 font-sans text-[14px] text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
      >
        Submit another ticket
      </button>
    </div>
  );
}
