"use client";

import { useCallback, useEffect, useState } from "react";
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
      <div className="h-40 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/40" />
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
export function SharedDocReader({
  token,
  docSlug,
}: {
  token: string;
  docSlug?: string;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const load = useCallback(async () => {
    try {
      const query = docSlug ? `?docSlug=${encodeURIComponent(docSlug)}` : "";
      // Credentials included so the unlock cookie travels once it exists.
      const response = await fetch(`/api/doc-shares/${token}${query}`, {
        credentials: "same-origin",
      });
      if (response.status === 401) {
        setStep("locked");
        return;
      }
      // Kept apart from the uniform failure screen: the link is still valid,
      // it is only the view bucket that is empty, and it refills.
      if (response.status === 429) {
        setStep("rate_limited");
        return;
      }
      if (!response.ok) {
        setStep("unavailable");
        return;
      }
      const data = await response.json();
      setPayload(data);
      setStep("ready");
    } catch {
      setStep("unavailable");
    }
  }, [token, docSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitPassphrase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passphrase.length < MIN_PASSPHRASE_LENGTH || isUnlocking) return;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const response = await fetch(`/api/doc-shares/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ passphrase }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setUnlockError(data.error ?? "Incorrect passphrase.");
        return;
      }
      setPassphrase("");
      setStep("loading");
      await load();
    } catch {
      setUnlockError("Something went wrong. Please try again.");
    } finally {
      setIsUnlocking(false);
    }
  };

  if (step === "loading") {
    return (
      <main className="mx-auto flex max-w-3xl items-center justify-center px-6 py-24">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
      </main>
    );
  }

  if (step === "unavailable") {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <h1 className="mb-2 text-lg font-semibold text-zinc-100">
            This link is no longer available
          </h1>
          {/* One message for every cause — expired, revoked, unpublished, or
              never valid. Naming which would tell a prober what they hit. */}
          <p className="text-sm text-zinc-400">
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/10">
            <Clock className="h-5 w-5 text-amber-400" />
          </div>
          <h1 className="mb-2 text-lg font-semibold text-zinc-100">
            Too many requests
          </h1>
          <p className="text-sm text-zinc-400">
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
          className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8"
        >
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-green-500/10">
            <Lock className="h-5 w-5 text-green-400" />
          </div>
          <h1 className="mb-2 text-center text-lg font-semibold text-zinc-100">
            Passphrase required
          </h1>
          <p className="mb-6 text-center text-sm text-zinc-400">
            The sender protected this document. They will have given you the
            passphrase separately.
          </p>
          <input
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="Passphrase"
            autoFocus
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-green-500/60"
          />
          {unlockError && (
            <p className="mt-3 text-center text-xs text-red-400">
              {unlockError}
            </p>
          )}
          <button
            type="submit"
            disabled={passphrase.length < MIN_PASSPHRASE_LENGTH || isUnlocking}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
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
        <p className="font-mono text-xs tracking-wide text-zinc-500 uppercase">
          {module.projectName}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-100">
          {module.module}
        </h1>
        <p className="mt-3 text-sm text-zinc-500">
          Shared by {module.sharedByName}. {module.pages.length}{" "}
          {module.pages.length === 1 ? "page" : "pages"}.
        </p>

        {module.note && (
          <p className="mt-6 border-l-2 border-green-500/40 pl-4 text-sm text-zinc-300 italic">
            {module.note}
          </p>
        )}

        <div className="mt-8 space-y-2 border-t border-zinc-800 pt-8">
          {/* A module whose pages were all unpublished is still a live link,
              not a dead one — say so instead of showing the failure screen. */}
          {module.pages.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No published pages in this module yet.
            </p>
          ) : (
            module.pages.map((page) => (
              <Link
                key={page.slug}
                href={`/d/${token}/${page.slug}`}
                className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900/70"
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-100">
                    {page.title}
                  </span>
                  {page.excerpt && (
                    <span className="mt-1 block text-sm text-zinc-500">
                      {page.excerpt}
                    </span>
                  )}
                </span>
              </Link>
            ))
          )}
        </div>

        <p className="mt-12 border-t border-zinc-800 pt-6 text-xs text-zinc-600">
          This link stops working on {expiryLine(module.expiresAt)}.
        </p>
      </main>
    );
  }

  const { doc, moduleName } = payload;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* Only a page reached THROUGH a module index has somewhere to go back
          to; a single-page link has no sibling to offer. */}
      {docSlug && (
        <Link
          href={`/d/${token}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          {moduleName ?? "All pages"}
        </Link>
      )}

      <p className="font-mono text-xs tracking-wide text-zinc-500 uppercase">
        {doc.projectName} · {doc.module}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-zinc-100">{doc.title}</h1>
      <p className="mt-3 text-sm text-zinc-500">
        Written by {doc.authorName}. Shared by {doc.sharedByName}.
      </p>

      {doc.note && (
        <p className="mt-6 border-l-2 border-green-500/40 pl-4 text-sm text-zinc-300 italic">
          {doc.note}
        </p>
      )}

      <div className="mt-8 border-t border-zinc-800 pt-8">
        <DocMarkdown body={doc.body} />
      </div>

      <p className="mt-12 border-t border-zinc-800 pt-6 text-xs text-zinc-600">
        This link stops working on {expiryLine(doc.expiresAt)}.
      </p>
    </main>
  );
}
