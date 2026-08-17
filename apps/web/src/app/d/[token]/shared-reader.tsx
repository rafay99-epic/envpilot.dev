"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  FileText,
  Loader2,
  Lock,
} from "lucide-react";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/doc-share-crypto";

// Same renderer the dashboard uses, so a mermaid diagram in a shared page
// renders here exactly as its author saw it.
const DocMarkdown = dynamic(
  () => import("@/components/docs/doc-markdown").then((m) => m.DocMarkdown),
  {
    ssr: false,
    loading: () => (
      <div className="h-40 animate-pulse rounded-lg border border-line bg-surface/40" />
    ),
  }
);

type SharedDoc = {
  title: string;
  module: string;
  body: string;
  authorName: string;
  sharedByName: string;
  projectName: string;
  note?: string;
  expiresAt: number;
  updatedAt: number;
};

type SharedModule = {
  module: string;
  projectName: string;
  sharedByName: string;
  note?: string;
  expiresAt: number;
  pages: {
    slug: string;
    title: string;
    excerpt?: string;
    updatedAt: number;
  }[];
};

type Payload =
  | { kind: "page"; moduleName?: string; doc: SharedDoc }
  | { kind: "module"; module: SharedModule };

type Step = "loading" | "locked" | "ready" | "unavailable" | "rate_limited";

function expiryLine(expiresAt: number): string {
  return new Date(expiresAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The whole public reading surface: a module index, or one page.
 *
 * Both routes under /d render this — a module link opened at the root shows
 * its index, and /d/[token]/[docSlug] passes the slug through so the same
 * gate chain hands back that one page.
 */
/**
 * Fetch the reader's state without touching React state.
 *
 * At module scope on purpose: the effect below needs a stable reference, and
 * a useCallback inside the component would be manual memoization that React
 * Compiler already handles. Taking token and slug as arguments makes it
 * stable by construction instead.
 */
async function fetchReaderState(
  token: string,
  docSlug: string | undefined
): Promise<{ step: Step; payload?: Payload }> {
  try {
    const query = docSlug ? `?docSlug=${encodeURIComponent(docSlug)}` : "";
    // Credentials included so the unlock cookie travels once it exists.
    const response = await fetch(`/api/doc-shares/${token}${query}`, {
      credentials: "same-origin",
    });
    if (response.status === 401) return { step: "locked" };
    // Kept apart from the uniform failure screen: the link is still valid,
    // it is only the view bucket that is empty, and it refills.
    if (response.status === 429) return { step: "rate_limited" };
    if (!response.ok) return { step: "unavailable" };
    return { step: "ready", payload: await response.json() };
  } catch {
    return { step: "unavailable" };
  }
}

export function SharedDocReader({
  token,
  docSlug,
}: {
  token: string;
  docSlug?: string;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [payload, setPayload] = useState<Payload | null>(null);
  const passphraseFieldId = useId();
  const [passphrase, setPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  // The state flag only lands on the next render, so a double submit would
  // send two unlock attempts against the rate-limited endpoint. The ref shuts
  // the window in the same tick.
  const isUnlockingRef = useRef(false);

  useEffect(() => {
    // A changed token or slug must not let a late response overwrite the view
    // the reader is now on.
    let cancelled = false;
    void fetchReaderState(token, docSlug).then((next) => {
      if (cancelled) return;
      if (next.payload) setPayload(next.payload);
      setStep(next.step);
    });
    return () => {
      cancelled = true;
    };
  }, [token, docSlug]);

  const submitPassphrase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passphrase.length < MIN_PASSPHRASE_LENGTH || isUnlockingRef.current)
      return;
    isUnlockingRef.current = true;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const response = await fetch(`/api/doc-shares/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ passphrase }),
      });
      if (response.ok) {
        setPassphrase("");
        setStep("loading");
        const next = await fetchReaderState(token, docSlug);
        if (next.payload) setPayload(next.payload);
        setStep(next.step);
      } else {
        const data = await response.json().catch(() => ({}));
        setUnlockError(data.error ?? "Incorrect passphrase.");
      }
    } catch {
      setUnlockError("Something went wrong. Please try again.");
    }
    // Released after the try/catch rather than in a `finally` — the compiler
    // bails on a component containing one. The catch swallows and no branch
    // returns early, so every path reaches here.
    isUnlockingRef.current = false;
    setIsUnlocking(false);
  };

  if (step === "loading") {
    return (
      <main className="mx-auto flex max-w-3xl items-center justify-center px-6 py-24">
        <Loader2 className="h-5 w-5 animate-spin text-ink-faint" />
      </main>
    );
  }

  if (step === "unavailable") {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <div className="rounded-xl border border-line bg-surface/40 p-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-warning-soft">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <h1 className="mb-2 text-lg font-semibold text-ink">
            This link is no longer available
          </h1>
          {/* One message for every cause — expired, revoked, unpublished, or
              never valid. Naming which would tell a prober what they hit. */}
          <p className="text-sm text-ink-muted">
            It may have expired, been revoked, or the page may have been taken
            down. Ask whoever sent it for a fresh link.
          </p>
        </div>
      </main>
    );
  }

  if (step === "rate_limited") {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <div className="rounded-xl border border-line bg-surface/40 p-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-warning-soft">
            <Clock className="h-5 w-5 text-warning" />
          </div>
          <h1 className="mb-2 text-lg font-semibold text-ink">
            Too many requests
          </h1>
          <p className="text-sm text-ink-muted">
            This link has been opened too many times in a short period. Wait a
            few minutes and reload — it has not expired or been revoked.
          </p>
        </div>
      </main>
    );
  }

  if (step === "locked") {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <form
          onSubmit={submitPassphrase}
          className="rounded-xl border border-line bg-surface/40 p-8"
        >
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft">
            <Lock className="h-5 w-5 text-accent" />
          </div>
          <h1 className="mb-2 text-center text-lg font-semibold text-ink">
            Passphrase required
          </h1>
          <p className="mb-6 text-center text-sm text-ink-muted">
            The sender protected this document. They will have given you the
            passphrase separately.
          </p>
          {/* sr-only: the heading and the paragraph above already name this
              single field, and a fourth line of centred copy would only
              repeat them. */}
          <label htmlFor={passphraseFieldId} className="sr-only">
            Passphrase
          </label>
          <input
            id={passphraseFieldId}
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="Passphrase"
            autoFocus
            autoComplete="off"
            // 16px on phones, or iOS zooms the viewport on focus.
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent-line sm:text-sm"
          />
          {unlockError && (
            <p className="mt-3 text-center text-xs text-danger">
              {unlockError}
            </p>
          )}
          <button
            type="submit"
            disabled={passphrase.length < MIN_PASSPHRASE_LENGTH || isUnlocking}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isUnlocking && <Loader2 className="h-4 w-4 animate-spin" />}
            Unlock
          </button>
        </form>
      </main>
    );
  }

  if (!payload) return null;

  if (payload.kind === "module") {
    const { module } = payload;
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="font-mono text-xs tracking-wide text-ink-subtle uppercase">
          {module.projectName}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-ink">{module.module}</h1>
        <p className="mt-3 text-sm text-ink-subtle">
          Shared by {module.sharedByName}. {module.pages.length}{" "}
          {module.pages.length === 1 ? "page" : "pages"}.
        </p>

        {module.note && (
          <p className="mt-6 border-l-2 border-accent-line pl-4 text-sm text-ink-muted italic">
            {module.note}
          </p>
        )}

        <div className="mt-8 space-y-2 border-t border-line pt-8">
          {/* A module whose pages were all unpublished is still a live link,
              not a dead one — say so instead of showing the failure screen. */}
          {module.pages.length === 0 ? (
            <p className="text-sm text-ink-subtle">
              No published pages in this module yet.
            </p>
          ) : (
            module.pages.map((page) => (
              <Link
                key={page.slug}
                href={`/d/${token}/${page.slug}`}
                className="flex gap-3 rounded-lg border border-line bg-surface/40 p-4 transition-colors hover:border-line hover:bg-surface-hover/70"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {page.title}
                  </span>
                  {page.excerpt && (
                    <span className="mt-1 block text-sm text-ink-subtle">
                      {page.excerpt}
                    </span>
                  )}
                </span>
              </Link>
            ))
          )}
        </div>

        <p className="mt-12 border-t border-line pt-6 text-xs text-ink-faint">
          This link stops working on {expiryLine(module.expiresAt)}.
        </p>
      </main>
    );
  }

  const { doc, moduleName } = payload;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {/* Only a page reached THROUGH a module index has somewhere to go back
          to; a single-page link has no sibling to offer. */}
      {docSlug && (
        <Link
          href={`/d/${token}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          {moduleName ?? "All pages"}
        </Link>
      )}

      <p className="font-mono text-xs tracking-wide text-ink-subtle uppercase">
        {doc.projectName} · {doc.module}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-ink">{doc.title}</h1>
      <p className="mt-3 text-sm text-ink-subtle">
        Written by {doc.authorName}. Shared by {doc.sharedByName}.
      </p>

      {doc.note && (
        <p className="mt-6 border-l-2 border-accent-line pl-4 text-sm text-ink-muted italic">
          {doc.note}
        </p>
      )}

      <div className="mt-8 border-t border-line pt-8">
        <DocMarkdown body={doc.body} />
      </div>

      <p className="mt-12 border-t border-line pt-6 text-xs text-ink-faint">
        This link stops working on {expiryLine(doc.expiresAt)}.
      </p>
    </main>
  );
}
