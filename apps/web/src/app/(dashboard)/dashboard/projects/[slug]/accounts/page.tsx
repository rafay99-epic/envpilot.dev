"use client";

import { useState, use } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { ConfirmDialog } from "@/components/ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import {
  useProjectBySlug,
  useConvexUser,
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useRevealAccount,
  type Account,
} from "@/hooks";
import {
  AccountListItem,
  AccountFormDrawer,
  AccountShareDrawer,
  type AccountFormData,
} from "@/components/accounts";
import { ENVIRONMENTS } from "@/constants/project";
import type { AccountVaultPayload } from "@/lib/account-payload";
import { ApiError } from "@/lib/api-client";
import { createLogger } from "@/lib/logger";

const log = createLogger("app/dashboard/project-accounts");

interface AccountsPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectAccountsPage({ params }: AccountsPageProps) {
  const { slug } = use(params);
  const { organization, user, capabilities } = useAuthContext();

  // Registry capability gates (getMyPermissions) — work for custom roles;
  // the server re-checks every mutation.
  const canCreate = capabilities["project.accounts.create"] === true;
  const canUpdate = capabilities["project.accounts.update"] === true;
  const canDelete = capabilities["project.accounts.delete"] === true;
  const canManagePermissions =
    capabilities["project.permissions.manage"] === true;

  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { convexUserId } = useConvexUser(user?.id);

  const project = useProjectBySlug(orgId, slug);
  const isLoadingProject = project === undefined && !!slug;
  const projectError = project === null ? new Error("Project not found") : null;
  const projectId = project?._id as Id<"projects"> | undefined;

  const accounts = useAccounts(projectId, convexUserId);
  const isLoadingAccounts = accounts === undefined;

  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const revealAccount = useRevealAccount();

  // ── UI state ──
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [sharingAccount, setSharingAccount] = useState<Account | null>(null);
  const [shareInitialTab, setShareInitialTab] = useState<"member" | "external">(
    "member"
  );

  const [revealed, setRevealed] = useState<
    Record<string, AccountVaultPayload | null>
  >({});
  const [revealingIds, setRevealingIds] = useState<Set<string>>(new Set());

  const accountList = accounts ?? [];
  const currentCount = accountList.length;
  const { allowed: canCreateGate } = useFeatureGate(
    orgId,
    "shared_accounts_limit",
    { currentCount }
  );

  const filteredAccounts = accountList.filter(
    (a) =>
      selectedEnvironment === "all" ||
      a.environments.includes(selectedEnvironment)
  );

  const revealCredentials = async (
    account: Account
  ): Promise<AccountVaultPayload | null> => {
    if (!account.vaultRef || !organization?.id || !convexUserId) return null;
    return revealAccount({
      accountId: account._id,
      vaultRef: account.vaultRef,
      organizationId: organization.id,
      userId: convexUserId,
    });
  };

  const handleReveal = async (account: Account) => {
    if (revealed[account._id]) return;
    setRevealingIds((prev) => new Set(prev).add(account._id));
    try {
      const creds = await revealCredentials(account);
      setRevealed((prev) => ({ ...prev, [account._id]: creds }));
      if (!creds) setError("Failed to reveal account credentials.");
    } finally {
      setRevealingIds((prev) => {
        const next = new Set(prev);
        next.delete(account._id);
        return next;
      });
    }
  };

  const handleCreate = async (data: AccountFormData) => {
    if (!projectId || !orgId) return;
    setNotice(null);
    setError(null);
    try {
      await createAccount.mutateAsync({
        organizationId: orgId,
        projectId,
        name: data.name,
        websiteUrl: data.websiteUrl || undefined,
        username: data.username,
        password: data.password,
        description: data.description || undefined,
        environments: data.environments,
      });
      setNotice("Account created successfully.");
      setShowCreateDrawer(false);
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === "TIER_LIMIT_REACHED"
          ? "Account limit reached. Upgrade to Pro for unlimited accounts."
          : err instanceof Error
            ? err.message
            : "Failed to create account";
      log.error(
        "project_account_create_failed",
        {
          projectId,
          organizationId: orgId,
          code: err instanceof ApiError ? err.code : undefined,
        },
        err
      );
      setError(message);
      throw err;
    }
  };

  const handleUpdate = async (data: AccountFormData) => {
    if (!editingAccount) return;
    setNotice(null);
    setError(null);
    try {
      await updateAccount.mutateAsync({
        id: editingAccount._id,
        name: data.name,
        // Send "" through (not undefined) so cleared optional fields are
        // actually removed server-side — see accounts.update field clearing.
        websiteUrl: data.websiteUrl,
        description: data.description,
        environments: data.environments,
        username: data.credentialsChanged ? data.username : undefined,
        password: data.credentialsChanged ? data.password : undefined,
      });
      // Drop any stale revealed credentials for this account.
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[editingAccount._id];
        return next;
      });
      setNotice("Account updated successfully.");
      setEditingAccount(null);
    } catch (err) {
      log.error(
        "project_account_update_failed",
        { projectId, accountId: editingAccount._id, organizationId: orgId },
        err
      );
      setError(err instanceof Error ? err.message : "Failed to update account");
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!deletingAccount) return;
    setNotice(null);
    setError(null);
    try {
      await deleteAccount.mutateAsync(deletingAccount._id);
      setDeletingAccount(null);
      setNotice("Account deleted successfully.");
    } catch (err) {
      log.error(
        "project_account_delete_failed",
        { projectId, accountId: deletingAccount._id, organizationId: orgId },
        err
      );
      setError(err instanceof Error ? err.message : "Failed to delete account");
      throw err;
    }
  };

  if (isLoadingProject) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-danger-soft p-3 bg-danger-soft">
          <KeyRound className="h-6 w-6 text-danger" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">
          {projectError instanceof Error
            ? projectError.message
            : "Project not found"}
        </h2>
        <Link
          href="/dashboard/projects"
          className="mt-6 text-sm font-medium text-ink-inverse hover:text-ink-muted"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <FeatureGate
      organizationId={orgId}
      featureKey="shared_accounts"
      featureName="Shared Accounts"
      fallbackVariant="card"
    >
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <PageHeader
            icon={KeyRound}
            title="Accounts"
            description={
              <>Shared service account credentials for {project.name}.</>
            }
          />
        </div>

        {notice && (
          <div className="rounded-lg border border-accent-line bg-accent-soft p-4 border-accent-line bg-accent-soft">
            <p className="text-sm text-accent">{notice}</p>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-danger-line bg-danger-soft p-4 border-danger-line bg-danger-soft">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Environment filter */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-ink-muted">
            Environment:
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedEnvironment("all")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedEnvironment === "all"
                  ? "bg-surface text-white bg-surface-raised text-ink-inverse"
                  : "bg-surface-raised text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover"
              }`}
            >
              All
            </button>
            {ENVIRONMENTS.map((env) => (
              <button
                key={env}
                onClick={() => setSelectedEnvironment(env)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  selectedEnvironment === env
                    ? "bg-surface text-white bg-surface-raised text-ink-inverse"
                    : "bg-surface-raised text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover"
                }`}
              >
                {env}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="rounded-xl border border-line bg-white border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-6 py-4 border-line">
            <div>
              <h2 className="font-semibold text-ink">Accounts</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {filteredAccounts.length} account
                {filteredAccounts.length !== 1 ? "s" : ""}
                {selectedEnvironment !== "all" && ` in ${selectedEnvironment}`}
              </p>
            </div>
            {canCreate && (
              <button
                onClick={() => setShowCreateDrawer(true)}
                disabled={!canCreateGate}
                title={
                  !canCreateGate
                    ? "Account limit reached. Upgrade to add more."
                    : undefined
                }
                className="flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 bg-surface-raised text-ink-inverse hover:bg-surface-hover"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Account
              </button>
            )}
          </div>

          <div className="divide-y divide-line">
            {isLoadingAccounts ? (
              <TerminalLoading />
            ) : filteredAccounts.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised">
                  <KeyRound className="h-6 w-6 text-ink-muted" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-ink">
                  No accounts yet
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {canCreate
                    ? "Add your first shared account to get started."
                    : "No accounts available for this environment."}
                </p>
              </div>
            ) : (
              <AnimatedList className="divide-y divide-line">
                {filteredAccounts.map((account) => (
                  <AccountListItem
                    key={account._id}
                    account={account}
                    onEdit={() => setEditingAccount(account)}
                    onDelete={() => setDeletingAccount(account)}
                    onManagePermissions={() => {
                      setShareInitialTab("member");
                      setSharingAccount(account);
                    }}
                    onShare={() => {
                      setShareInitialTab("external");
                      setSharingAccount(account);
                    }}
                    onReveal={() => handleReveal(account)}
                    revealedValue={revealed[account._id] ?? null}
                    isRevealing={revealingIds.has(account._id)}
                    canEdit={canUpdate || account.permission === "write"}
                    canDelete={canDelete}
                    canManagePermissions={canManagePermissions}
                    permissionLevel={
                      account.permission === "read" ||
                      account.permission === "write"
                        ? account.permission
                        : null
                    }
                  />
                ))}
              </AnimatedList>
            )}
          </div>
        </div>

        {/* Create drawer */}
        <AccountFormDrawer
          isOpen={showCreateDrawer}
          onClose={() => setShowCreateDrawer(false)}
          onSubmit={handleCreate}
          title="Add Account"
          submitLabel="Create Account"
        />

        {/* Edit drawer */}
        <AccountFormDrawer
          isOpen={!!editingAccount}
          onClose={() => setEditingAccount(null)}
          onSubmit={handleUpdate}
          account={editingAccount}
          onRevealCredentials={
            editingAccount ? () => revealCredentials(editingAccount) : undefined
          }
        />

        {/* Delete confirm */}
        <ConfirmDialog
          isOpen={!!deletingAccount}
          onClose={() => setDeletingAccount(null)}
          onConfirm={handleDelete}
          title="Delete Account"
          message={`Are you sure you want to delete "${deletingAccount?.name}"? You can restore it for 7 days. After that it is permanently deleted, including the stored credentials.`}
          confirmText="Delete"
          variant="danger"
        />

        {/* Share drawer */}
        {sharingAccount && orgId && projectId && convexUserId && (
          <AccountShareDrawer
            isOpen={!!sharingAccount}
            onClose={() => setSharingAccount(null)}
            account={sharingAccount}
            organizationId={orgId}
            projectId={projectId}
            userId={convexUserId}
            initialTab={shareInitialTab}
            onRevealCredentials={() => revealCredentials(sharingAccount)}
          />
        )}
      </div>
    </FeatureGate>
  );
}
