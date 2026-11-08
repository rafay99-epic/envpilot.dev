import { v, ConvexError, type Infer } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { createAuditLog } from "../../lib/audit";
import {
  ENVIRONMENT_LIST_TEXT,
  unknownEnvironments,
} from "../../lib/environments";
import {
  getRoleProfile,
  isEnvironmentScopeAllowed,
  isSuspendedMembership,
} from "../../lib/authz";
import {
  authorizeAccountAccess,
  authorizeVariableAccess,
  requireAccountAccess,
  requireFileAccess,
  requireVariableAccess,
} from "../../lib/authHelpers";
import {
  oauthRateKey,
  requireOAuthUser,
  resolveOAuthOrganization,
  verifyOAuthToken,
  type OAuthPrincipal,
} from "../../lib/mcpOAuth";
import { protectedEnvironmentsIn } from "../../lib/protection";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { createAccountAs, type AccountWriteResult } from "../accounts/values";
import { listAccountsFor } from "../accounts/queries";
import { fromBase64, toBase64 } from "../files/crypto";
import { normalizeFilePath } from "../files/helpers";
import { listFilesFor } from "../files/queries";
import { readFileAs, uploadFileAs, type UploadOutcome } from "../files/values";
import {
  assertValidVariableFields,
  assertWithinEnvironmentScope,
  environmentConflictMessage,
  findEnvironmentConflicts,
} from "../variables/helpers";
import { vaultReadWithRetry } from "../vault/vault";
import { consumeRateLimit } from "./helpers";
import { requireOrgProject } from "./oauth";

/**
 * MCP tools that touch variables, secret files and shared accounts.
 *
 * Every action verifies the OAuth token, then runs the same core the
 * dashboard runs, with the verified person as the actor: role, environment
 * scope, tier limits and per-environment uniqueness are enforced there, not
 * here. Two choices are MCP-only: a write into a protected environment always
 * becomes a change request (an agent never gets break-glass), and variable
 * and account writes are charged against `mcpWrite` before any vault object
 * is minted (file uploads keep their own per-user `fileUpload` bucket).
 */

const organizationArg = v.optional(v.string());

const writeResultValidator = v.union(
  v.object({ status: v.literal("created") }),
  v.object({ status: v.literal("updated") }),
  v.object({
    status: v.literal("proposed"),
    requestId: v.id("changeRequests"),
    protectedEnvironments: v.array(v.string()),
  })
);
type WriteResult =
  | { status: "created" | "updated" }
  | {
      status: "proposed";
      requestId: Id<"changeRequests">;
      protectedEnvironments: string[];
    };

type ResolvedProject = {
  userId: Id<"users">;
  organizationId: Id<"organizations">;
  projectId: Id<"projects">;
};

async function resolveProject(
  ctx: QueryCtx,
  args: { workosId: string; organization?: string; projectSlug: string }
): Promise<{ user: Doc<"users">; project: Doc<"projects"> }> {
  const user = await requireOAuthUser(ctx, args.workosId);
  const organization = await resolveOAuthOrganization(
    ctx,
    user._id,
    args.organization
  );
  const project = await requireOrgProject(
    ctx,
    organization._id,
    args.projectSlug
  );
  return { user, project };
}

const projectArgs = {
  workosId: v.string(),
  organization: organizationArg,
  projectSlug: v.string(),
};

async function deleteVaultObject(ctx: ActionCtx, vaultRef: string) {
  await ctx
    .runAction(internal.features.vault.vault.deleteSecret, { vaultRef })
    .catch(() => {
      // Best effort — vaultGc reconciles any straggler.
    });
}

/**
 * Refuse an environment name the platform does not have.
 *
 * The MCP tool schema carries a zod enum, but that lives in the Next.js layer
 * and every action in this file is a PUBLIC Convex endpoint that any valid MCP
 * token can call directly. An unknown name used to be written straight
 * through, and because protection matching is exact, "Production" never
 * matched a protected "production": the write APPLIED instead of becoming a
 * change request, and landed a row no reader ever resolves.
 */
function assertKnownEnvironments(environments: readonly string[]): void {
  const unknown = unknownEnvironments(environments);
  if (unknown.length === 0) return;
  const names = unknown.map((name) => `"${name}"`).join(", ");
  throw new ConvexError(
    `Unknown environment${unknown.length > 1 ? "s" : ""} ${names}. Valid environments: ${ENVIRONMENT_LIST_TEXT}.`
  );
}

async function startWrite(
  ctx: ActionCtx,
  token: string,
  environments?: readonly string[]
): Promise<OAuthPrincipal> {
  const principal = await verifyOAuthToken(token);
  await consumeRateLimit(ctx, "mcpWrite", oauthRateKey(principal));
  // After the rate limit on purpose, so a typo costs the caller quota. (The
  // token is already verified above, so there is no unauthenticated prober to
  // worry about either way.)
  if (environments) assertKnownEnvironments(environments);
  return principal;
}

// ─── Variables ───────────────────────────────────────────────────────────────

export const createVariable = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    key: v.string(),
    value: v.string(),
    environments: v.array(v.string()),
    isSensitive: v.optional(v.boolean()),
    description: v.optional(v.string()),
  },
  returns: writeResultValidator,
  handler: async (ctx, args): Promise<WriteResult> => {
    const principal = await startWrite(ctx, args.token, args.environments);
    const target: ResolvedProject & { protectedEnvironments: string[] } =
      await ctx.runQuery(
        internal.features.api.oauthResources._preflightVariableCreate,
        {
          workosId: principal.workosId,
          organization: args.organization,
          projectSlug: args.projectSlug,
          key: args.key,
          description: args.description,
          environments: args.environments,
        }
      );

    const vault = await ctx.runAction(
      internal.features.vault.vault.createSecret,
      {
        name: args.key,
        value: args.value,
        organizationId: target.organizationId,
        projectId: target.projectId,
      }
    );

    try {
      if (target.protectedEnvironments.length > 0) {
        const requestId: Id<"changeRequests"> = await ctx.runMutation(
          internal.features.changeRequests.mutations.createStaged,
          {
            projectId: target.projectId,
            resourceType: "variable",
            kind: "create",
            environments: args.environments,
            payload: JSON.stringify({
              key: args.key,
              description: args.description,
              environments: args.environments,
              isSensitive: args.isSensitive ?? false,
            }),
            vaultRef: vault.id,
            label: args.key,
            source: "mcp",
            requestedBy: target.userId,
          }
        );
        return {
          status: "proposed",
          requestId,
          protectedEnvironments: target.protectedEnvironments,
        };
      }
      await ctx.runMutation(internal.features.variables.mutations._createFor, {
        projectId: target.projectId,
        createdBy: target.userId,
        key: args.key,
        vaultRef: vault.id,
        description: args.description,
        environments: args.environments,
        isSensitive: args.isSensitive ?? false,
      });
      return { status: "created" };
    } catch (error) {
      await deleteVaultObject(ctx, vault.id);
      throw error;
    }
  },
});

/**
 * Everything that can refuse a create, checked before the value is written
 * to the vault so a refused create never mints an object. The create
 * mutation runs the same checks again as the authority.
 */
export const _preflightVariableCreate = internalQuery({
  args: {
    ...projectArgs,
    key: v.string(),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<ResolvedProject & { protectedEnvironments: string[] }> => {
    const { user, project } = await resolveProject(ctx, args);
    if (args.environments.length === 0) {
      throw new ConvexError("Pass at least one environment");
    }
    const { environmentScope } = await authorizeVariableAccess(ctx, {
      userId: user._id,
      projectId: project._id,
      action: "project:create_variable",
      preloadedProject: project,
    });
    assertWithinEnvironmentScope(environmentScope, args.environments);
    assertValidVariableFields({ key: args.key, description: args.description });
    const clashes = await findEnvironmentConflicts(ctx, {
      projectId: project._id,
      key: args.key,
      environments: args.environments,
    });
    if (clashes.length > 0) {
      throw new ConvexError(environmentConflictMessage(args.key, clashes));
    }
    return {
      userId: user._id,
      organizationId: project.organizationId,
      projectId: project._id,
      protectedEnvironments: protectedEnvironmentsIn(
        project,
        args.environments
      ),
    };
  },
});

export const updateVariable = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    environment: v.string(),
    key: v.string(),
    value: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.object({
    result: writeResultValidator,
    environments: v.array(v.string()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ result: WriteResult; environments: string[] }> => {
    if (args.value === undefined && args.description === undefined) {
      throw new ConvexError("Pass a new value, a new description, or both");
    }
    const principal = await startWrite(ctx, args.token, [args.environment]);
    const target: ResolvedProject & {
      variableId: Id<"environmentVariables">;
      environments: string[];
      protectedEnvironments: string[];
    } = await ctx.runQuery(
      internal.features.api.oauthResources._preflightVariableUpdate,
      {
        workosId: principal.workosId,
        organization: args.organization,
        projectSlug: args.projectSlug,
        environment: args.environment,
        key: args.key,
      }
    );

    const vaultRef =
      args.value === undefined
        ? undefined
        : (
            await ctx.runAction(internal.features.vault.vault.createSecret, {
              name: args.key,
              value: args.value,
              organizationId: target.organizationId,
              projectId: target.projectId,
            })
          ).id;

    try {
      if (target.protectedEnvironments.length > 0) {
        const requestId: Id<"changeRequests"> = await ctx.runMutation(
          internal.features.changeRequests.mutations.createStaged,
          {
            projectId: target.projectId,
            resourceType: "variable",
            kind: "update",
            targetId: target.variableId,
            environments: target.environments,
            payload: JSON.stringify({ description: args.description }),
            vaultRef,
            label: args.key,
            source: "mcp",
            requestedBy: target.userId,
          }
        );
        return {
          result: {
            status: "proposed",
            requestId,
            protectedEnvironments: target.protectedEnvironments,
          },
          environments: target.environments,
        };
      }
      await ctx.runMutation(internal.features.variables.mutations._updateFor, {
        variableId: target.variableId,
        updatedBy: target.userId,
        vaultRef,
        description: args.description,
        changeReason: "Updated over MCP",
      });
      return {
        result: { status: "updated" },
        environments: target.environments,
      };
    } catch (error) {
      if (vaultRef) await deleteVaultObject(ctx, vaultRef);
      throw error;
    }
  },
});

/** Finds the one variable that holds `key` in `environment`, writable by the user. */
export const _preflightVariableUpdate = internalQuery({
  args: { ...projectArgs, environment: v.string(), key: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<
    ResolvedProject & {
      variableId: Id<"environmentVariables">;
      environments: string[];
      protectedEnvironments: string[];
    }
  > => {
    const { user, project } = await resolveProject(ctx, args);
    const candidates = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_and_key", (q) =>
        q.eq("projectId", project._id).eq("key", args.key)
      )
      .take(50);
    // Per-environment uniqueness means at most one active row matches.
    const variable = candidates.find(
      (row) =>
        row.deletedAt === undefined &&
        row.environments.includes(args.environment)
    );
    // A variable this person cannot read answers exactly like a missing one,
    // so the error never confirms that a key exists.
    const access = variable
      ? await requireVariableAccess(
          ctx,
          user._id,
          variable,
          "read",
          project
        ).catch(() => null)
      : null;
    if (!variable || !access) {
      throw new ConvexError(
        `No variable "${args.key}" in ${args.environment} for this project`
      );
    }
    if (access !== "write") {
      throw new ConvexError(
        `Your role cannot change "${args.key}" in this project`
      );
    }
    return {
      userId: user._id,
      organizationId: project.organizationId,
      projectId: project._id,
      variableId: variable._id,
      environments: variable.environments,
      protectedEnvironments: protectedEnvironmentsIn(
        project,
        variable.environments
      ),
    };
  },
});

// ─── Secret files ────────────────────────────────────────────────────────────

const fileSummaryValidator = v.object({
  path: v.string(),
  name: v.string(),
  mode: v.string(),
  size: v.number(),
  sha256: v.string(),
  environments: v.array(v.string()),
  description: v.optional(v.string()),
  access: v.union(v.literal("read"), v.literal("write")),
  updatedAt: v.number(),
});
type FileSummary = Infer<typeof fileSummaryValidator>;

export const listFiles = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    environment: v.optional(v.string()),
  },
  returns: v.array(fileSummaryValidator),
  handler: async (ctx, args): Promise<FileSummary[]> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    return await ctx.runQuery(internal.features.api.oauthResources._listFiles, {
      workosId: principal.workosId,
      organization: args.organization,
      projectSlug: args.projectSlug,
      environment: args.environment,
    });
  },
});

export const _listFiles = internalQuery({
  args: { ...projectArgs, environment: v.optional(v.string()) },
  returns: v.array(fileSummaryValidator),
  handler: async (ctx, args): Promise<FileSummary[]> => {
    const { user, project } = await resolveProject(ctx, args);
    const files = await listFilesFor(ctx, user._id, {
      projectId: project._id,
      environment: args.environment,
    });
    return files.map((file) => ({
      path: file.path,
      name: file.name,
      mode: file.mode,
      size: file.size,
      sha256: file.sha256,
      environments: file.environments,
      description: file.description,
      access: file.access,
      updatedAt: file.updatedAt,
    }));
  },
});

/**
 * The active file at `path` that this person can read. Paths are unique per
 * environment, so a path stored for several disjoint environment sets needs
 * `environment` to pick. Files the person cannot read are skipped, so a
 * missing file and an unreadable one answer the same way.
 */
async function findFileAtPath(
  ctx: QueryCtx,
  userId: Id<"users">,
  project: Doc<"projects">,
  rawPath: string,
  environment: string | undefined
): Promise<Doc<"projectFiles"> | null> {
  const path = normalizeFilePath(rawPath);
  const candidates = (
    await ctx.db
      .query("projectFiles")
      .withIndex("by_project_and_path", (q) =>
        q.eq("projectId", project._id).eq("path", path)
      )
      .take(50)
  ).filter(
    (file) =>
      file.deletedAt === undefined &&
      (environment === undefined || file.environments.includes(environment))
  );
  const matches: Doc<"projectFiles">[] = [];
  for (const file of candidates) {
    const readable = await requireFileAccess(
      ctx,
      userId,
      file,
      "read",
      project
    ).catch(() => null);
    if (readable) matches.push(file);
  }
  if (matches.length > 1) {
    throw new ConvexError(
      `"${path}" exists in several environment sets (${matches
        .map((file) => file.environments.join("+"))
        .join(", ")}). Pass environment to pick one.`
    );
  }
  return matches[0] ?? null;
}

export const getFile = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    path: v.string(),
    environment: v.optional(v.string()),
  },
  returns: v.object({
    path: v.string(),
    mode: v.string(),
    size: v.number(),
    sha256: v.string(),
    encoding: v.union(v.literal("utf8"), v.literal("base64")),
    content: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    path: string;
    mode: string;
    size: number;
    sha256: string;
    encoding: "utf8" | "base64";
    content: string;
  }> => {
    const principal = await verifyOAuthToken(args.token);
    const target: { userId: Id<"users">; fileId: Id<"projectFiles"> } =
      await ctx.runQuery(internal.features.api.oauthResources._resolveFile, {
        workosId: principal.workosId,
        organization: args.organization,
        projectSlug: args.projectSlug,
        path: args.path,
        environment: args.environment,
      });
    // readFileAs authorizes, rate-limits per user, decrypts and audits.
    const file = await readFileAs(ctx, target.userId, {
      fileId: target.fileId,
      source: "mcp",
    });
    const bytes = fromBase64(file.content);
    let text: string | null = null;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // Binary content; returned as base64 below.
    }
    return {
      path: file.path,
      mode: file.mode,
      size: file.size,
      sha256: file.sha256,
      encoding: text === null ? "base64" : "utf8",
      content: text ?? file.content,
    };
  },
});

export const _resolveFile = internalQuery({
  args: {
    ...projectArgs,
    path: v.string(),
    environment: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ userId: Id<"users">; fileId: Id<"projectFiles"> }> => {
    const { user, project } = await resolveProject(ctx, args);
    const file = await findFileAtPath(
      ctx,
      user._id,
      project,
      args.path,
      args.environment
    );
    if (!file) throw new ConvexError(`No secret file at "${args.path}"`);
    return { userId: user._id, fileId: file._id };
  },
});

export const uploadFile = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    path: v.string(),
    content: v.string(),
    encoding: v.optional(v.union(v.literal("utf8"), v.literal("base64"))),
    environments: v.array(v.string()),
    name: v.optional(v.string()),
    mode: v.optional(v.string()),
    description: v.optional(v.string()),
    replace: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      status: v.union(v.literal("created"), v.literal("updated")),
      path: v.string(),
      size: v.number(),
      sha256: v.string(),
    }),
    v.object({
      status: v.literal("proposed"),
      requestId: v.id("changeRequests"),
    })
  ),
  handler: async (
    ctx,
    args
  ): Promise<
    | {
        status: "created" | "updated";
        path: string;
        size: number;
        sha256: string;
      }
    | { status: "proposed"; requestId: Id<"changeRequests"> }
  > => {
    const principal = await verifyOAuthToken(args.token);
    // This action verifies the token itself rather than going through
    // startWrite, so the environment check is repeated here.
    //
    // A rejection has to cost quota. The fileUpload bucket is consumed inside
    // uploadFileAs, so returning before it meant a malformed upload was free
    // and could be repeated without limit.
    //
    // Precisely what this does: it charges the fileUpload BUCKET, keyed by the
    // caller's OAuth identity (`oauth:<workosId>`). uploadFileAs keys the same
    // bucket by the Convex user id, so these are two separate counters, not
    // one shared allowance. That is enough for the goal here, which is that a
    // rejected upload is no longer free to repeat, and a malformed upload does
    // no vault or blob work, so letting it draw on its own counter costs
    // nothing real. Charged on the rejection path only, so a valid upload is
    // not billed on this counter at all.
    const unknownEnvs = unknownEnvironments(args.environments);
    if (unknownEnvs.length > 0) {
      await consumeRateLimit(ctx, "fileUpload", oauthRateKey(principal));
      assertKnownEnvironments(args.environments);
    }
    const target: ResolvedProject & {
      path: string;
      environments: string[];
      replaceFileId?: Id<"projectFiles">;
    } = await ctx.runQuery(
      internal.features.api.oauthResources._resolveUpload,
      {
        workosId: principal.workosId,
        organization: args.organization,
        projectSlug: args.projectSlug,
        path: args.path,
        environments: args.environments,
        replace: args.replace ?? false,
      }
    );
    // A replace persists the EXISTING row's environments, not the caller's
    // (see _resolveUpload), so the resolved list is checked as well. A row
    // written before this validation existed can hold an unknown name, and
    // re-persisting it would keep a file no reader resolves and that
    // protection matching never recognises.
    if (target.environments !== args.environments) {
      const unknown = unknownEnvironments(target.environments);
      if (unknown.length > 0) {
        throw new ConvexError(
          `The existing file at "${target.path}" is stored against unknown environment${unknown.length > 1 ? "s" : ""} ${unknown
            .map((name) => `"${name}"`)
            .join(
              ", "
            )}. Fix that file in the dashboard before replacing it over MCP. Valid environments: ${ENVIRONMENT_LIST_TEXT}.`
        );
      }
    }

    const content =
      args.encoding === "base64"
        ? args.content
        : toBase64(new TextEncoder().encode(args.content));

    // uploadFileAs authorizes, checks tier limits and path conflicts,
    // encrypts, and files a change request for a protected environment.
    const outcome: UploadOutcome = await uploadFileAs(ctx, target.userId, {
      projectId: target.projectId,
      name: args.name ?? target.path.split("/").pop() ?? target.path,
      path: target.path,
      content,
      mode: args.mode,
      description: args.description,
      environments: target.environments,
      replaceFileId: target.replaceFileId,
      request: true,
      source: "mcp",
    });
    if ("requested" in outcome) {
      return { status: "proposed", requestId: outcome.requestId };
    }
    return {
      status: target.replaceFileId ? "updated" : "created",
      path: target.path,
      size: outcome.size,
      sha256: outcome.sha256,
    };
  },
});

export const _resolveUpload = internalQuery({
  args: {
    ...projectArgs,
    path: v.string(),
    environments: v.array(v.string()),
    replace: v.boolean(),
  },
  handler: async (
    ctx,
    args
  ): Promise<
    ResolvedProject & {
      path: string;
      environments: string[];
      replaceFileId?: Id<"projectFiles">;
    }
  > => {
    const { user, project } = await resolveProject(ctx, args);
    const path = normalizeFilePath(args.path);
    const resolved = {
      userId: user._id,
      organizationId: project.organizationId,
      projectId: project._id,
      path,
      environments: args.environments,
    };
    if (!args.replace) return resolved;
    const existing = await findFileAtPath(
      ctx,
      user._id,
      project,
      path,
      args.environments[0]
    );
    if (!existing) {
      throw new ConvexError(
        `No secret file at "${path}" to replace. Upload it without replace to create it.`
      );
    }
    // A replace swaps contents only; it never moves the file to other
    // environments, so the file's own set is what gets checked and staged.
    return {
      ...resolved,
      environments: existing.environments,
      replaceFileId: existing._id,
    };
  },
});

// ─── Shared accounts ─────────────────────────────────────────────────────────

const accountSummaryValidator = v.object({
  name: v.string(),
  websiteUrl: v.optional(v.string()),
  description: v.optional(v.string()),
  environments: v.array(v.string()),
  access: v.union(v.literal("read"), v.literal("write"), v.null()),
});
type AccountSummary = Infer<typeof accountSummaryValidator>;

export const listAccounts = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
  },
  returns: v.array(accountSummaryValidator),
  handler: async (ctx, args): Promise<AccountSummary[]> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    return await ctx.runQuery(
      internal.features.api.oauthResources._listAccounts,
      {
        workosId: principal.workosId,
        organization: args.organization,
        projectSlug: args.projectSlug,
      }
    );
  },
});

export const _listAccounts = internalQuery({
  args: projectArgs,
  returns: v.array(accountSummaryValidator),
  handler: async (ctx, args): Promise<AccountSummary[]> => {
    const { user, project } = await resolveProject(ctx, args);
    const accounts = await listAccountsFor(ctx, user._id, {
      projectId: project._id,
    });
    return accounts.map((account) => ({
      name: account.name,
      websiteUrl: account.websiteUrl,
      description: account.description,
      environments: account.environments,
      // "admin" is permission management on top of write.
      access:
        account.permission === "admin"
          ? "write"
          : (account.permission as "read" | "write" | null),
    }));
  },
});

export const getAccount = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    name: v.string(),
  },
  returns: v.object({
    name: v.string(),
    websiteUrl: v.optional(v.string()),
    environments: v.array(v.string()),
    username: v.string(),
    password: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    name: string;
    websiteUrl?: string;
    environments: string[];
    username: string;
    password: string;
  }> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "cicdPull", oauthRateKey(principal));
    const account: {
      accountId: Id<"projectAccounts">;
      userId: Id<"users">;
      vaultRef: string;
      name: string;
      websiteUrl?: string;
      environments: string[];
    } = await ctx.runQuery(
      internal.features.api.oauthResources._readableAccount,
      {
        workosId: principal.workosId,
        organization: args.organization,
        projectSlug: args.projectSlug,
        name: args.name,
      }
    );

    let credentials: { username: string; password: string };
    try {
      const parsed: unknown = JSON.parse(
        await vaultReadWithRetry(account.vaultRef)
      );
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("username" in parsed) ||
        !("password" in parsed) ||
        typeof parsed.username !== "string" ||
        typeof parsed.password !== "string"
      ) {
        throw new Error("malformed");
      }
      credentials = { username: parsed.username, password: parsed.password };
    } catch {
      throw new ConvexError(
        `Failed to decrypt "${account.name}". Transient vault errors are retryable.`
      );
    }

    await ctx.runMutation(
      internal.features.api.oauthResources._recordAccountRead,
      {
        accountId: account.accountId,
        userId: account.userId,
        clientId: principal.clientId,
      }
    );
    return {
      name: account.name,
      websiteUrl: account.websiteUrl,
      environments: account.environments,
      ...credentials,
    };
  },
});

export const _readableAccount = internalQuery({
  args: { ...projectArgs, name: v.string() },
  handler: async (ctx, args) => {
    const { user, project } = await resolveProject(ctx, args);
    const matches = (
      await ctx.db
        .query("projectAccounts")
        .withIndex("by_project_and_name", (q) =>
          q.eq("projectId", project._id).eq("name", args.name)
        )
        .take(20)
    ).filter((account) => account.deletedAt === undefined);
    // An account the person cannot read reads as missing.
    const readable: Doc<"projectAccounts">[] = [];
    for (const account of matches) {
      try {
        await requireAccountAccess(ctx, user._id, account, "read", project);
        readable.push(account);
      } catch {
        // Not visible to this person.
      }
    }
    if (readable.length === 0) {
      throw new ConvexError(`No account named "${args.name}"`);
    }
    if (readable.length > 1) {
      throw new ConvexError(
        `Several accounts are named "${args.name}". Rename one in the dashboard to read it here.`
      );
    }
    const account = readable[0];
    return {
      accountId: account._id,
      userId: user._id,
      vaultRef: account.vaultRef,
      name: account.name,
      websiteUrl: account.websiteUrl,
      environments: account.environments,
    };
  },
});

export const _recordAccountRead = internalMutation({
  args: {
    accountId: v.id("projectAccounts"),
    userId: v.id("users"),
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    const project = account ? await ctx.db.get(account.projectId) : null;
    if (!account || !project) return;
    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: account.projectId,
      userId: args.userId,
      action: "account.accessed",
      details: {
        accountId: args.accountId,
        accountName: account.name,
        via: "oauth",
        clientId: args.clientId,
      },
      involvesSensitiveData: true,
      resourceType: "account",
    });
  },
});

export const createAccount = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    name: v.string(),
    username: v.string(),
    password: v.string(),
    environments: v.array(v.string()),
    websiteUrl: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: writeResultValidator,
  handler: async (ctx, args): Promise<WriteResult> => {
    const principal = await startWrite(ctx, args.token, args.environments);
    const target: ResolvedProject & { protectedEnvironments: string[] } =
      await ctx.runQuery(
        internal.features.api.oauthResources._preflightAccountCreate,
        {
          workosId: principal.workosId,
          organization: args.organization,
          projectSlug: args.projectSlug,
          name: args.name,
          environments: args.environments,
        }
      );
    // createAccountAs files a change request for a protected environment
    // because no override is passed; createCore authorizes the direct write.
    const result: AccountWriteResult = await createAccountAs(
      ctx,
      target.userId,
      {
        projectId: target.projectId,
        name: args.name,
        websiteUrl: args.websiteUrl,
        username: args.username,
        password: args.password,
        description: args.description,
        environments: args.environments,
        source: "mcp",
      }
    );
    return "requested" in result
      ? {
          status: "proposed",
          requestId: result.requestId,
          protectedEnvironments: target.protectedEnvironments,
        }
      : { status: "created" };
  },
});

/**
 * Refuses an account create the core would refuse, before the credentials
 * reach the vault. The core runs the same checks again as the authority.
 */
export const _preflightAccountCreate = internalQuery({
  args: {
    ...projectArgs,
    name: v.string(),
    environments: v.array(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<ResolvedProject & { protectedEnvironments: string[] }> => {
    const { user, project } = await resolveProject(ctx, args);
    if (args.environments.length === 0) {
      throw new ConvexError("Pass at least one environment");
    }
    const gate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "shared_accounts"
    );
    if (!gate.allowed) {
      throw new ConvexError(
        "Shared accounts are not included in this organization's plan"
      );
    }
    const { environmentScope } = await authorizeAccountAccess(ctx, {
      userId: user._id,
      projectId: project._id,
      action: "project:create_account",
      preloadedProject: project,
    });
    assertWithinEnvironmentScope(environmentScope, args.environments);
    // envpilot_get_account reads by name, and an agent retrying a timed-out
    // create must not store the login twice, so names stay unique over MCP.
    const sameName = await ctx.db
      .query("projectAccounts")
      .withIndex("by_project_and_name", (q) =>
        q.eq("projectId", project._id).eq("name", args.name)
      )
      .take(20);
    // Only accounts this person can already see count, so the refusal never
    // confirms an account outside their environment scope.
    if (
      sameName.some(
        (account) =>
          account.deletedAt === undefined &&
          isEnvironmentScopeAllowed(environmentScope, account.environments)
      )
    ) {
      throw new ConvexError(
        `An account named "${args.name}" already exists in this project`
      );
    }
    return {
      userId: user._id,
      organizationId: project.organizationId,
      projectId: project._id,
      protectedEnvironments: protectedEnvironmentsIn(
        project,
        args.environments
      ),
    };
  },
});

// ─── Change requests ─────────────────────────────────────────────────────────

const REQUEST_SCAN_LIMIT = 500;
const REQUEST_LIST_LIMIT = 50;

const requestStatusValidator = v.union(
  v.literal("pending"),
  v.literal("applied"),
  v.literal("rejected"),
  v.literal("canceled"),
  v.literal("expired")
);

const requestSummaryValidator = v.object({
  requestId: v.id("changeRequests"),
  projectSlug: v.string(),
  label: v.string(),
  resourceType: v.union(
    v.literal("variable"),
    v.literal("account"),
    v.literal("file")
  ),
  kind: v.string(),
  environments: v.array(v.string()),
  status: requestStatusValidator,
  reviewReason: v.optional(v.string()),
  createdAt: v.number(),
  reviewedAt: v.optional(v.number()),
});
type RequestSummary = Infer<typeof requestSummaryValidator>;

export const listRequests = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.optional(v.string()),
    status: v.optional(requestStatusValidator),
  },
  returns: v.array(requestSummaryValidator),
  handler: async (ctx, args): Promise<RequestSummary[]> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    return await ctx.runQuery(
      internal.features.api.oauthResources._listRequests,
      {
        workosId: principal.workosId,
        organization: args.organization,
        projectSlug: args.projectSlug,
        status: args.status,
      }
    );
  },
});

/** Change requests the caller filed, from any surface, newest first. */
export const _listRequests = internalQuery({
  args: {
    workosId: v.string(),
    organization: organizationArg,
    projectSlug: v.optional(v.string()),
    status: v.optional(requestStatusValidator),
  },
  returns: v.array(requestSummaryValidator),
  handler: async (ctx, args): Promise<RequestSummary[]> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const organization = await resolveOAuthOrganization(
      ctx,
      user._id,
      args.organization
    );
    const onlyProject =
      args.projectSlug === undefined
        ? undefined
        : await requireOrgProject(ctx, organization._id, args.projectSlug);
    const status = args.status;
    const rows = await ctx.db
      .query("changeRequests")
      .withIndex("by_requester_org_status", (q) => {
        const scoped = q
          .eq("requestedBy", user._id)
          .eq("organizationId", organization._id);
        return status === undefined ? scoped : scoped.eq("status", status);
      })
      .order("desc")
      .take(REQUEST_SCAN_LIMIT);

    const slugs = new Map<Id<"projects">, string | null>();
    const results: RequestSummary[] = [];
    for (const row of rows.sort((a, b) => b.createdAt - a.createdAt)) {
      if (results.length >= REQUEST_LIST_LIMIT) break;
      if (onlyProject && row.projectId !== onlyProject._id) continue;
      if (!slugs.has(row.projectId)) {
        const project = await ctx.db.get(row.projectId);
        slugs.set(
          row.projectId,
          project && project.deletedAt === undefined ? project.slug : null
        );
      }
      const projectSlug = slugs.get(row.projectId);
      if (!projectSlug) continue;
      results.push({
        requestId: row._id,
        projectSlug,
        label: row.label,
        resourceType: row.resourceType,
        kind: row.kind,
        environments: row.environments,
        status: row.status,
        reviewReason: row.reviewReason,
        createdAt: row.createdAt,
        reviewedAt: row.reviewedAt,
      });
    }
    return results;
  },
});

// ─── Organizations ───────────────────────────────────────────────────────────

const organizationSummaryValidator = v.object({
  name: v.string(),
  slug: v.string(),
  role: v.string(),
  mcpEnabled: v.boolean(),
});
type OrganizationSummary = Infer<typeof organizationSummaryValidator>;

export const listOrganizations = action({
  args: { token: v.string() },
  returns: v.array(organizationSummaryValidator),
  handler: async (ctx, args): Promise<OrganizationSummary[]> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    return await ctx.runQuery(
      internal.features.api.oauthResources._listOrganizations,
      { workosId: principal.workosId }
    );
  },
});

/**
 * The organizations the caller belongs to, so a multi-organization account
 * can pick the `organization` slug the other tools take.
 */
export const _listOrganizations = internalQuery({
  args: { workosId: v.string() },
  returns: v.array(organizationSummaryValidator),
  handler: async (ctx, args): Promise<OrganizationSummary[]> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const memberships = (
      await ctx.db
        .query("organizationMembers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    ).filter((membership) => !isSuspendedMembership(membership));
    const results: OrganizationSummary[] = [];
    for (const membership of memberships) {
      const organization = await ctx.db.get(membership.organizationId);
      if (!organization) continue;
      const profile = await getRoleProfile(ctx, membership.role);
      const gate = await checkBooleanFeature(
        ctx.db,
        organization._id,
        "mcp_server"
      );
      results.push({
        name: organization.name,
        slug: organization.slug,
        role: profile.displayName,
        mcpEnabled: gate.allowed,
      });
    }
    return results;
  },
});
