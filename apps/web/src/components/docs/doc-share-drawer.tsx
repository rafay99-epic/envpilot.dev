"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  FileText,
  FolderOpen,
  Globe,
  Loader2,
  Lock,
  Users,
} from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import {
  useDocAccess,
  useOrganizationMembers,
  useShareDocWithMembers,
} from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { MIN_PASSPHRASE_LENGTH } from "@/lib/doc-share-crypto";
import { sanitizeConvexError } from "@/lib/error-messages";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const TTL_OPTIONS = [
  { label: "24 hours", value: DAY_MS },
  { label: "7 days", value: 7 * DAY_MS },
  { label: "30 days", value: 30 * DAY_MS },
];

const FIELD =
  "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-line bg-surface text-ink placeholder:text-ink-faint";
const LABEL = "mb-1.5 block text-xs font-medium text-ink-muted";

interface DocShareDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  docId: Id<"docs">;
  docTitle: string;
  /** The page's module — the unit a "whole module" share covers. */
  docModule: string;
  projectId: Id<"projects">;
  /** Only a published page can be shared — a draft has not been reviewed. */
  isPublished: boolean;
}

/**
 * Share one page. Two tabs because they are two different acts: handing a
 * page to a named teammate, and putting it on the open internet behind a
 * token. The second is a separate capability and a separate tier gate, and
 * the tab is simply absent without them.
 */
export function DocShareDrawer({
  isOpen,
  onClose,
  docId,
  docTitle,
  docModule,
  projectId,
  isPublished,
}: DocShareDrawerProps) {
  const { user, organization } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;

  const access = useDocAccess(projectId);
  // Skipped while closed. The drawer stays mounted so AnimatePresence can play
  // its exit, which would otherwise leave a member-roster subscription open on
  // every documentation page view. `access` is not skipped — the page already
  // subscribes to it, so Convex serves both from one subscription.
  const members = useOrganizationMembers(isOpen ? orgId : undefined);
  const shareWithMembers = useShareDocWithMembers();

  const [tab, setTab] = useState<"team" | "link">("team");
  // What is being shared. A module share is ONE row and ONE email covering
  // every published page in the module — the alternative is N shares and N
  // messages to the same person for what is really one handover.
  const [scope, setScope] = useState<"page" | "module">("page");
  const [selected, setSelected] = useState<Id<"users">[]>([]);
  const [note, setNote] = useState("");
  const [ttlMs, setTtlMs] = useState(TTL_OPTIONS[1].value);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const canShareExternal = access?.canShareExternal === true;
  // The tab appears for anyone whose ROLE can share externally. Whether the
  // plan allows it decides what the tab contains, not whether it exists —
  // silently hiding a capability the user holds reads as a broken product.
  const showLinkTab = canShareExternal || access?.externalUpgradeRequired;

  // Self is excluded (you already hold the page) and so is anyone suspended —
  // the mutation refuses both, so offering them would be a dead click.
  const selfEmail = user?.email?.toLowerCase();
  const candidates = (members ?? []).filter(
    (member): member is NonNullable<typeof member> =>
      member !== null &&
      member.status !== "suspended" &&
      member.user.email.toLowerCase() !== selfEmail
  );

  const reset = () => {
    setScope("page");
    setSelected([]);
    setNote("");
    setError(null);
    setNotice(null);
    setPassphrase("");
    setUsePassphrase(false);
    setRecipientEmail("");
    setLinkUrl(null);
    setCopied(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  // Exactly one target reaches the backend; it refuses both or neither.
  const shareTarget =
    scope === "module" ? { projectId, module: docModule } : { docId };

  const toggle = (userId: Id<"users">) => {
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  };

  const submitTeam = async () => {
    if (selected.length === 0 || isBusy) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await shareWithMembers({
        ...shareTarget,
        recipientUserIds: selected,
        ttlMs,
        note: note.trim() || undefined,
      });
      const parts: string[] = [];
      if (result.created > 0) {
        parts.push(
          `Shared with ${result.created} ${result.created === 1 ? "person" : "people"}`
        );
      }
      // Re-sharing to someone who already holds the page refreshes their
      // access rather than sending a second email — say so, or it looks
      // like nothing happened.
      if (result.refreshed > 0) {
        parts.push(`${result.refreshed} already had access (extended)`);
      }
      setNotice(parts.join(" · "));
      setSelected([]);
      setNote("");
    } catch (err) {
      setError(sanitizeConvexError(err));
    } finally {
      setIsBusy(false);
    }
  };

  const submitLink = async () => {
    if (isBusy) return;
    if (usePassphrase && passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(
        `A passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`
      );
      return;
    }
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/doc-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...shareTarget,
          ttlMs,
          passphrase: usePassphrase ? passphrase : undefined,
          recipientEmail: recipientEmail.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not create the link.");
        return;
      }
      // Built from the origin the sender is actually on, not from the
      // absolute URL the server returned. That one comes from
      // NEXT_PUBLIC_APP_URL, a deployment setting that can legitimately point
      // somewhere else (and locally is often wrong outright) — a link you copy
      // out of this drawer should open on the host you copied it from. The
      // emailed copy still uses the configured URL, which is correct for mail.
      // Matches how the shares list below already builds its copy link.
      setLinkUrl(`${window.location.origin}/d/${data.token}`);
      setPassphrase("");
      setNotice(
        recipientEmail.trim()
          ? "Link created. Delivery to that address is queued, not confirmed — copy the link as a fallback. The passphrase, if any, is never emailed; send it separately."
          : "Link created."
      );
    } catch {
      setError("Could not create the link. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const copyLink = async () => {
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DrawerPanel isOpen={isOpen} onClose={close} title="Share page" width="lg">
      <div className="space-y-6">
        <div>
          <label className={LABEL}>Sharing</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScope("page")}
              className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                scope === "page"
                  ? "border-accent-line bg-accent-soft"
                  : "border-line hover:bg-surface-hover"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <FileText className="h-3.5 w-3.5" /> This page
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-ink-subtle">
                {docTitle}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setScope("module")}
              className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                scope === "module"
                  ? "border-accent-line bg-accent-soft"
                  : "border-line hover:bg-surface-hover"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <FolderOpen className="h-3.5 w-3.5" /> Whole module
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-ink-subtle">
                {docModule}
              </span>
            </button>
          </div>
          {scope === "module" && (
            <p className="mt-2 text-[11px] text-ink-subtle">
              Every published page in {docModule}, as one share and one email —
              including pages published into it later.
            </p>
          )}
        </div>

        {!isPublished && scope === "page" && (
          <p className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning">
            This page is a draft. Publish it first — sharing an unreviewed page
            is deliberately not possible. You can still share the module, which
            covers its published pages.
          </p>
        )}

        {showLinkTab && (
          <div className="flex gap-1 rounded-lg p-1 bg-surface-raised/60">
            <button
              type="button"
              onClick={() => setTab("team")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "team"
                  ? "shadow-sm bg-surface text-ink"
                  : "text-ink-subtle hover:text-ink-muted"
              }`}
            >
              <Users className="h-3.5 w-3.5" /> Team
            </button>
            <button
              type="button"
              onClick={() => setTab("link")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "link"
                  ? "shadow-sm bg-surface text-ink"
                  : "text-ink-subtle hover:text-ink-muted"
              }`}
            >
              <Globe className="h-3.5 w-3.5" /> Public link
            </button>
          </div>
        )}

        {tab === "team" ? (
          <div className="space-y-4">
            <div>
              <label className={LABEL}>
                Who should read it ({selected.length} selected)
              </label>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1 border-line">
                {members === undefined && (
                  <p className="px-2 py-3 text-xs text-ink-subtle">
                    Loading members…
                  </p>
                )}
                {members !== undefined && candidates.length === 0 && (
                  <p className="px-2 py-3 text-xs text-ink-subtle">
                    Nobody else is in this organization yet.
                  </p>
                )}
                {candidates.map((member) => (
                  <label
                    key={member.userId}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-hover/60"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(member.userId)}
                      onChange={() => toggle(member.userId)}
                      className="h-3.5 w-3.5 accent-accent-hover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {member.user.name || member.user.email}
                      </span>
                      <span className="block truncate text-[11px] text-ink-subtle">
                        {member.user.email}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <TtlPicker value={ttlMs} onChange={setTtlMs} />
            <NoteField value={note} onChange={setNote} />

            <button
              type="button"
              onClick={submitTeam}
              disabled={
                (scope === "page" && !isPublished) ||
                selected.length === 0 ||
                isBusy
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              Share with {selected.length || ""}{" "}
              {selected.length === 1 ? "person" : "people"}
            </button>
            <p className="text-[11px] text-ink-subtle">
              {scope === "module"
                ? `Each person gets read access to ${docModule} — not the rest of the project.`
                : "Each person gets read access to this one page — not the project."}
            </p>
          </div>
        ) : !canShareExternal ? (
          <div className="rounded-lg border px-4 py-6 text-center border-line">
            <Globe className="mx-auto mb-3 h-5 w-5 text-ink-subtle" />
            <p className="text-sm font-medium text-ink">
              Public links are a Pro feature
            </p>
            <p className="mt-1.5 text-xs text-ink-subtle">
              Share a published page with someone outside your organization
              through an expiring link, optionally behind a passphrase.
            </p>
            <Link
              href="/dashboard/usage"
              className="mt-4 inline-block rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent"
            >
              View plans
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {linkUrl ? (
              <div>
                <label className={LABEL}>Link</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={linkUrl}
                    className={`${FIELD} font-mono text-xs`}
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className="shrink-0 rounded-lg border px-3 border-line text-ink-muted hover:bg-surface-hover"
                    aria-label="Copy link"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-accent" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setLinkUrl(null)}
                  className="mt-3 text-xs text-ink-subtle underline underline-offset-2 hover:text-ink-muted"
                >
                  Create another link
                </button>
              </div>
            ) : (
              <>
                <TtlPicker value={ttlMs} onChange={setTtlMs} />
                <div>
                  <label className={LABEL}>Email it to (optional)</label>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(event) => setRecipientEmail(event.target.value)}
                    placeholder="person@example.com"
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={usePassphrase}
                      onChange={(event) =>
                        setUsePassphrase(event.target.checked)
                      }
                      className="h-3.5 w-3.5 accent-accent-hover"
                    />
                    <Lock className="h-3.5 w-3.5" />
                    Require a passphrase
                  </label>
                  {usePassphrase && (
                    <>
                      <input
                        type="password"
                        value={passphrase}
                        onChange={(event) => setPassphrase(event.target.value)}
                        placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters`}
                        autoComplete="new-password"
                        className={`${FIELD} mt-2`}
                      />
                      <p className="mt-1.5 text-[11px] text-warning">
                        Give this to the reader yourself. It is deliberately
                        never included in the email.
                      </p>
                    </>
                  )}
                </div>
                <NoteField value={note} onChange={setNote} />
                <button
                  type="button"
                  onClick={submitLink}
                  disabled={(scope === "page" && !isPublished) || isBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create public link
                </button>
                <p className="text-[11px] text-ink-subtle">
                  Anyone holding the link can read this page until it expires or
                  you revoke it. It is never indexed by search engines.
                </p>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg border border-accent-line bg-accent-soft px-3 py-2 text-xs text-accent">
            {notice}
          </p>
        )}
      </div>
    </DrawerPanel>
  );
}

function TtlPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className={LABEL}>Access expires after</label>
      <div className="flex gap-2">
        {TTL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              value === option.value
                ? "border-accent-line bg-accent-soft text-accent"
                : "border-line text-ink-muted hover:bg-surface-hover"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NoteField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={LABEL}>Note (optional)</label>
      <input
        type="text"
        value={value}
        maxLength={280}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Why you are sending this"
        className={FIELD}
      />
    </div>
  );
}
