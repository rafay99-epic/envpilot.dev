"use client";

import { useState, use } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { normalizeOrgRole, roleLevel, ROLE_LEVEL } from "@/lib/roles";
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
  const { organization, user } = useAuthContext();

  const orgRole = normalizeOrgRole(organization?.role);
  const hasOrgRole = !!organization?.role;
  const canCreate = hasOrgRole;
  const canUpdate = hasOrgRole && roleLevel(orgRole) >= ROLE_LEVEL.team_lead;
  const canDelete = canUpdate;
  const canManagePermissions = canUpdate;

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
        <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
          <KeyRound className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {projectError instanceof Error
            ? projectError.message
            : "Project not found"}
        </h2>
        <Link
          href="/dashboard/projects"
          className="mt-6 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
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
          <div className="flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-zinc-400" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Accounts
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Shared service account credentials for {project.name}.
              </p>
            </div>
          </div>
        </div>

        {notice && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-900/20">
            <p className="text-sm text-green-700 dark:text-green-400">
              {notice}
            </p>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Environment filter */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Environment:
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedEnvironment("all")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedEnvironment === "all"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {env}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <div>
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                Accounts
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
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
                className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {isLoadingAccounts ? (
              <TerminalLoading />
            ) : filteredAccounts.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <KeyRound className="h-6 w-6 text-zinc-400" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  No accounts yet
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {canCreate
                    ? "Add your first shared account to get started."
                    : "No accounts available for this environment."}
                </p>
              </div>
            ) : (
              <AnimatedList className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
          message={`Are you sure you want to delete "${deletingAccount?.name}"? This action cannot be undone.`}
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
