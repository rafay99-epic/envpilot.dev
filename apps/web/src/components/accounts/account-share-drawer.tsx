"use client";

import { useId, useState } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { X, Loader2, UserPlus, Link2 } from "lucide-react";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { formatDateWith } from "@/lib/format";
import { useTimeZone } from "@/hooks/useTimeZone";
import { serializeAccountShare } from "@/lib/account-payload";
import type { AccountVaultPayload } from "@/lib/account-payload";
import { ShareLinkForm } from "@/components/shared/share-link-form";
import {
  useAccountGrants,
  useAssignableAccountMembers,
  useGrantAccountPermission,
  useRevokeAccountPermission,
} from "@/hooks";

interface AccountShareDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  account: {
    _id: Id<"projectAccounts">;
    name: string;
    websiteUrl?: string;
  };
  organizationId: string;
  projectId: string;
  /** Convex user id of the person granting / sharing. */
  userId: Id<"users">;
  onRevealCredentials: () => Promise<AccountVaultPayload | null>;
  /** Which tab to open on. Defaults to the team-member (internal grant) tab. */
  initialTab?: ShareTab;
}

type ShareTab = "member" | "external";
type GrantPermission = "read" | "write";

const EXPIRY_OPTIONS: { label: string; ms: number | null }[] = [
  { label: "1 day", ms: 86_400_000 },
  { label: "7 days", ms: 604_800_000 },
  { label: "30 days", ms: 2_592_000_000 },
  { label: "Never", ms: null },
];

interface AssignableMember {
  _id: Id<"users">;
  email: string;
  name?: string;
  role?: string;
  isAssignedToProject?: boolean;
}

interface AccountGrant {
  _id: Id<"accountPermissions">;
  userId: Id<"users">;
  permission: GrantPermission;
  isActive: boolean;
  expiresAt?: number;
  user?: { email: string; name?: string } | null;
}

export function AccountShareDrawer({
  isOpen,
  onClose,
  account,
  organizationId,
  projectId,
  userId,
  onRevealCredentials,
  initialTab = "member",
}: AccountShareDrawerProps) {
  // The drawer is conditionally mounted (unmounts on close), so seeding the
  // tab from initialTab here also resets it every time it reopens for a new
  // account — no synchronizing effect required.
  const [tab, setTab] = useState<ShareTab>(initialTab);

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Share Account"
      width="lg"
    >
      <div className="space-y-5">
        {/* Account label */}
        <div>
          <div className="mb-1.5 block text-xs font-medium text-ink-muted">
            Account
          </div>
          <div className="rounded-lg px-3 py-2 text-sm font-semibold bg-surface-raised text-ink">
            {account.name}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 rounded-lg p-1 bg-surface-raised">
          <button
            type="button"
            onClick={() => setTab("member")}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === "member"
                ? "shadow-sm bg-surface-hover text-ink"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            Team member
          </button>
          <button
            type="button"
            onClick={() => setTab("external")}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === "external"
                ? "shadow-sm bg-surface-hover text-ink"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            <Link2 className="h-4 w-4" />
            External link
          </button>
        </div>

        {tab === "member" ? (
          <TeamMemberMode
            accountId={account._id}
            userId={userId}
            onClose={onClose}
          />
        ) : (
          <ExternalLinkMode
            account={account}
            organizationId={organizationId}
            projectId={projectId}
            onRevealCredentials={onRevealCredentials}
            onClose={onClose}
          />
        )}
      </div>
    </DrawerPanel>
  );
}

/* ─── Team member (internal grant) ─────────────────────────────────── */

function TeamMemberMode({
  accountId,
  userId,
  onClose,
}: {
  accountId: Id<"projectAccounts">;
  userId: Id<"users">;
  onClose: () => void;
}) {
  const members = useAssignableAccountMembers(accountId, userId) as
    | AssignableMember[]
    | undefined;
  const grants = useAccountGrants(accountId) as AccountGrant[] | undefined;
  const grant = useGrantAccountPermission();
  const revoke = useRevokeAccountPermission();

  const [selectedMember, setSelectedMember] = useState<string>("");
  const [permission, setPermission] = useState<GrantPermission>("read");
  const [expiryMs, setExpiryMs] = useState<number | null>(null);
  const [isGranting, setIsGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeZone = useTimeZone();
  const uid = useId();
  const permissionLabelId = `${uid}-permission`;
  const expiryLabelId = `${uid}-expiry`;

  const activeGrants = (grants ?? []).filter((g) => g.isActive);

  const handleGrant = async () => {
    if (!selectedMember) {
      setError("Select a team member");
      return;
    }
    setIsGranting(true);
    setError(null);
    try {
      await grant({
        accountId,
        userId: selectedMember as Id<"users">,
        permission,
        grantedBy: userId,
        expiresAt: expiryMs ? Date.now() + expiryMs : undefined,
      });
      setSelectedMember("");
      setPermission("read");
      setExpiryMs(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant access");
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevoke = async (granteeUserId: Id<"users">) => {
    setRevokingId(granteeUserId);
    setError(null);
    try {
      await revoke({ accountId, userId: granteeUserId, revokedBy: userId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke access");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Member picker */}
      <div>
        <label
          htmlFor="account-share-member"
          className="mb-1.5 block text-xs font-medium text-ink-muted"
        >
          Team member
        </label>
        <select
          id="account-share-member"
          value={selectedMember}
          onChange={(e) => {
            setSelectedMember(e.target.value);
            setError(null);
          }}
          disabled={members === undefined}
          className="block w-full rounded-lg border px-3 py-2 text-base focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong disabled:opacity-50 sm:text-sm border-line bg-surface-raised text-ink"
        >
          <option value="">
            {members === undefined
              ? "Loading members…"
              : members.length === 0
                ? "No eligible members"
                : "Select a member…"}
          </option>
          {members?.map((m) => (
            <option key={m._id} value={m._id}>
              {m.name ? `${m.name} (${m.email})` : m.email}
            </option>
          ))}
        </select>
      </div>

      {/* Permission */}
      <div>
        <div
          id={permissionLabelId}
          className="mb-1.5 block text-xs font-medium text-ink-muted"
        >
          Permission
        </div>
        <div
          role="group"
          aria-labelledby={permissionLabelId}
          className="flex gap-2"
        >
          {(["read", "write"] as GrantPermission[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPermission(p)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                permission === p
                  ? "border-line bg-ink text-ink-inverse"
                  : "border-line text-ink-muted hover:border-line-strong"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Expiry */}
      <div>
        <div
          id={expiryLabelId}
          className="mb-1.5 block text-xs font-medium text-ink-muted"
        >
          Expires
        </div>
        <div
          role="group"
          aria-labelledby={expiryLabelId}
          className="flex flex-wrap gap-2"
        >
          {EXPIRY_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setExpiryMs(opt.ms)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                expiryMs === opt.ms
                  ? "bg-accent-soft text-accent ring-1 ring-accent-line"
                  : "bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={handleGrant}
        disabled={isGranting || !selectedMember}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
      >
        {isGranting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isGranting ? "Granting…" : "Grant access"}
      </button>

      {/* Existing grants */}
      <div className="border-t pt-4 border-line">
        <h3 className="text-xs font-medium text-ink-muted">
          Active grants ({activeGrants.length})
        </h3>
        {grants === undefined ? (
          <p className="mt-2 text-sm text-ink-muted">Loading…</p>
        ) : activeGrants.length === 0 ? (
          <p className="mt-2 text-sm text-ink-subtle">
            No team members have been granted access yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {activeGrants.map((g) => (
              <li
                key={g._id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {g.user?.name ?? g.user?.email ?? "Unknown user"}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    <span className="capitalize">{g.permission}</span>
                    {g.expiresAt
                      ? ` · expires ${formatDateWith(g.expiresAt, { dateStyle: "short" }, timeZone)}`
                      : " · no expiry"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(g.userId)}
                  disabled={revokingId === g.userId}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 border-danger-line text-danger hover:bg-danger-soft"
                >
                  {revokingId === g.userId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end border-t pt-4 border-line">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-hover"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/* ─── External link (one-time / time-limited share) ────────────────── */

function ExternalLinkMode({
  account,
  organizationId,
  projectId,
  onRevealCredentials,
  onClose,
}: {
  account: { _id: Id<"projectAccounts">; name: string; websiteUrl?: string };
  organizationId: string;
  projectId: string;
  onRevealCredentials: () => Promise<AccountVaultPayload | null>;
  onClose: () => void;
}) {
  return (
    <ShareLinkForm
      organizationId={organizationId}
      projectId={projectId}
      buildPayload={async () => {
        const creds = await onRevealCredentials();
        if (!creds) {
          throw new Error("Failed to retrieve account credentials");
        }
        return serializeAccountShare({
          name: account.name,
          username: creds.username,
          password: creds.password,
          url: account.websiteUrl,
        });
      }}
      extraShareArgs={{
        resourceType: "account",
        accountId: account._id,
        variableKey: account.name,
      }}
      oneTimeDestroyedMessage="The credentials will be permanently destroyed after the first view."
      sentry={{
        source: "account-share-drawer",
        extra: { accountName: account.name },
      }}
      onClose={onClose}
    />
  );
}
