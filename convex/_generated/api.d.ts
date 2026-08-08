/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as features_accounts_mutations from "../features/accounts/mutations.js";
import type * as features_accounts_queries from "../features/accounts/queries.js";
import type * as features_accounts_values from "../features/accounts/values.js";
import type * as features_admin_analytics from "../features/admin/analytics.js";
import type * as features_admin_auth from "../features/admin/auth.js";
import type * as features_admin_changelog from "../features/admin/changelog.js";
import type * as features_admin_crons from "../features/admin/crons.js";
import type * as features_admin_e2e from "../features/admin/e2e.js";
import type * as features_admin_featureFlags from "../features/admin/featureFlags.js";
import type * as features_admin_featureRequests from "../features/admin/featureRequests.js";
import type * as features_admin_inbox from "../features/admin/inbox.js";
import type * as features_admin_migrations from "../features/admin/migrations.js";
import type * as features_admin_organizations from "../features/admin/organizations.js";
import type * as features_admin_roles from "../features/admin/roles.js";
import type * as features_admin_settings from "../features/admin/settings.js";
import type * as features_admin_stats from "../features/admin/stats.js";
import type * as features_admin_tables from "../features/admin/tables.js";
import type * as features_admin_tiers from "../features/admin/tiers.js";
import type * as features_admin_users from "../features/admin/users.js";
import type * as features_admin_variables from "../features/admin/variables.js";
import type * as features_api_authorize from "../features/api/authorize.js";
import type * as features_api_docs from "../features/api/docs.js";
import type * as features_api_helpers from "../features/api/helpers.js";
import type * as features_api_keys from "../features/api/keys.js";
import type * as features_api_reads from "../features/api/reads.js";
import type * as features_api_requests from "../features/api/requests.js";
import type * as features_audit_compliance from "../features/audit/compliance.js";
import type * as features_audit_helpers from "../features/audit/helpers.js";
import type * as features_audit_queries from "../features/audit/queries.js";
import type * as features_audit_security from "../features/audit/security.js";
import type * as features_auth_queries from "../features/auth/queries.js";
import type * as features_billing_checkout from "../features/billing/checkout.js";
import type * as features_billing_gracePeriods from "../features/billing/gracePeriods.js";
import type * as features_billing_queries from "../features/billing/queries.js";
import type * as features_billing_tierLimits from "../features/billing/tierLimits.js";
import type * as features_billing_webhooks from "../features/billing/webhooks.js";
import type * as features_cicd_pull from "../features/cicd/pull.js";
import type * as features_community_changelog_publish from "../features/community/changelog/publish.js";
import type * as features_community_changelog_queries from "../features/community/changelog/queries.js";
import type * as features_community_changelog_seed from "../features/community/changelog/seed.js";
import type * as features_community_featureRequests_mutations from "../features/community/featureRequests/mutations.js";
import type * as features_community_featureRequests_queries from "../features/community/featureRequests/queries.js";
import type * as features_community_featureRequests_seed from "../features/community/featureRequests/seed.js";
import type * as features_dashboard_dashboard from "../features/dashboard/dashboard.js";
import type * as features_docs_content from "../features/docs/content.js";
import type * as features_docs_gc from "../features/docs/gc.js";
import type * as features_docs_guards from "../features/docs/guards.js";
import type * as features_docs_helpers from "../features/docs/helpers.js";
import type * as features_docs_mutations from "../features/docs/mutations.js";
import type * as features_docs_queries from "../features/docs/queries.js";
import type * as features_docs_templates from "../features/docs/templates.js";
import type * as features_emails_emails from "../features/emails/emails.js";
import type * as features_emails_loops from "../features/emails/loops.js";
import type * as features_emails_templates from "../features/emails/templates.js";
import type * as features_featureRegistry_gates from "../features/featureRegistry/gates.js";
import type * as features_featureRegistry_queries from "../features/featureRegistry/queries.js";
import type * as features_featureRegistry_resolver from "../features/featureRegistry/resolver.js";
import type * as features_files_blobStore from "../features/files/blobStore.js";
import type * as features_files_crypto from "../features/files/crypto.js";
import type * as features_files_helpers from "../features/files/helpers.js";
import type * as features_files_mutations from "../features/files/mutations.js";
import type * as features_files_queries from "../features/files/queries.js";
import type * as features_files_values from "../features/files/values.js";
import type * as features_integrations_dispatch from "../features/integrations/dispatch.js";
import type * as features_integrations_messages from "../features/integrations/messages.js";
import type * as features_integrations_notify from "../features/integrations/notify.js";
import type * as features_integrations_queue from "../features/integrations/queue.js";
import type * as features_integrations_webhooks from "../features/integrations/webhooks.js";
import type * as features_organizations_invitations from "../features/organizations/invitations.js";
import type * as features_organizations_memberSessions from "../features/organizations/memberSessions.js";
import type * as features_organizations_mutations from "../features/organizations/mutations.js";
import type * as features_organizations_queries from "../features/organizations/queries.js";
import type * as features_organizations_roleOptions from "../features/organizations/roleOptions.js";
import type * as features_organizations_securityHold from "../features/organizations/securityHold.js";
import type * as features_organizations_tombstones from "../features/organizations/tombstones.js";
import type * as features_permissions_accountPermissions_mutations from "../features/permissions/accountPermissions/mutations.js";
import type * as features_permissions_accountPermissions_queries from "../features/permissions/accountPermissions/queries.js";
import type * as features_permissions_revocationEvents from "../features/permissions/revocationEvents.js";
import type * as features_permissions_variablePermissions_cleanup from "../features/permissions/variablePermissions/cleanup.js";
import type * as features_permissions_variablePermissions_queries from "../features/permissions/variablePermissions/queries.js";
import type * as features_projects_favorites from "../features/projects/favorites.js";
import type * as features_projects_helpers from "../features/projects/helpers.js";
import type * as features_projects_members from "../features/projects/members.js";
import type * as features_projects_mutations from "../features/projects/mutations.js";
import type * as features_projects_queries from "../features/projects/queries.js";
import type * as features_projects_tags from "../features/projects/tags.js";
import type * as features_projects_templates from "../features/projects/templates.js";
import type * as features_sharing_cleanup from "../features/sharing/cleanup.js";
import type * as features_sharing_helpers from "../features/sharing/helpers.js";
import type * as features_sharing_mutations from "../features/sharing/mutations.js";
import type * as features_sharing_queries from "../features/sharing/queries.js";
import type * as features_support_contactMessages from "../features/support/contactMessages.js";
import type * as features_support_supportTickets from "../features/support/supportTickets.js";
import type * as features_users_deviceSessions from "../features/users/deviceSessions.js";
import type * as features_users_preferences from "../features/users/preferences.js";
import type * as features_users_projectAccess from "../features/users/projectAccess.js";
import type * as features_users_users from "../features/users/users.js";
import type * as features_variables_helpers from "../features/variables/helpers.js";
import type * as features_variables_mutations from "../features/variables/mutations.js";
import type * as features_variables_queries from "../features/variables/queries.js";
import type * as features_variables_requests_actions from "../features/variables/requests/actions.js";
import type * as features_variables_requests_helpers from "../features/variables/requests/helpers.js";
import type * as features_variables_requests_mutations from "../features/variables/requests/mutations.js";
import type * as features_variables_requests_queries from "../features/variables/requests/queries.js";
import type * as features_variables_rotation from "../features/variables/rotation.js";
import type * as features_variables_share from "../features/variables/share.js";
import type * as features_variables_values from "../features/variables/values.js";
import type * as features_vault_gc from "../features/vault/gc.js";
import type * as features_vault_reveal from "../features/vault/reveal.js";
import type * as features_vault_vault from "../features/vault/vault.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authHelpers from "../lib/authHelpers.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_capabilities from "../lib/capabilities.js";
import type * as lib_fileLimits from "../lib/fileLimits.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_integrationLimits from "../lib/integrationLimits.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_roleCompat from "../lib/roleCompat.js";
import type * as lib_roleProfiles from "../lib/roleProfiles.js";
import type * as lib_seedData from "../lib/seedData.js";
import type * as lib_users from "../lib/users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "features/accounts/mutations": typeof features_accounts_mutations;
  "features/accounts/queries": typeof features_accounts_queries;
  "features/accounts/values": typeof features_accounts_values;
  "features/admin/analytics": typeof features_admin_analytics;
  "features/admin/auth": typeof features_admin_auth;
  "features/admin/changelog": typeof features_admin_changelog;
  "features/admin/crons": typeof features_admin_crons;
  "features/admin/e2e": typeof features_admin_e2e;
  "features/admin/featureFlags": typeof features_admin_featureFlags;
  "features/admin/featureRequests": typeof features_admin_featureRequests;
  "features/admin/inbox": typeof features_admin_inbox;
  "features/admin/migrations": typeof features_admin_migrations;
  "features/admin/organizations": typeof features_admin_organizations;
  "features/admin/roles": typeof features_admin_roles;
  "features/admin/settings": typeof features_admin_settings;
  "features/admin/stats": typeof features_admin_stats;
  "features/admin/tables": typeof features_admin_tables;
  "features/admin/tiers": typeof features_admin_tiers;
  "features/admin/users": typeof features_admin_users;
  "features/admin/variables": typeof features_admin_variables;
  "features/api/authorize": typeof features_api_authorize;
  "features/api/docs": typeof features_api_docs;
  "features/api/helpers": typeof features_api_helpers;
  "features/api/keys": typeof features_api_keys;
  "features/api/reads": typeof features_api_reads;
  "features/api/requests": typeof features_api_requests;
  "features/audit/compliance": typeof features_audit_compliance;
  "features/audit/helpers": typeof features_audit_helpers;
  "features/audit/queries": typeof features_audit_queries;
  "features/audit/security": typeof features_audit_security;
  "features/auth/queries": typeof features_auth_queries;
  "features/billing/checkout": typeof features_billing_checkout;
  "features/billing/gracePeriods": typeof features_billing_gracePeriods;
  "features/billing/queries": typeof features_billing_queries;
  "features/billing/tierLimits": typeof features_billing_tierLimits;
  "features/billing/webhooks": typeof features_billing_webhooks;
  "features/cicd/pull": typeof features_cicd_pull;
  "features/community/changelog/publish": typeof features_community_changelog_publish;
  "features/community/changelog/queries": typeof features_community_changelog_queries;
  "features/community/changelog/seed": typeof features_community_changelog_seed;
  "features/community/featureRequests/mutations": typeof features_community_featureRequests_mutations;
  "features/community/featureRequests/queries": typeof features_community_featureRequests_queries;
  "features/community/featureRequests/seed": typeof features_community_featureRequests_seed;
  "features/dashboard/dashboard": typeof features_dashboard_dashboard;
  "features/docs/content": typeof features_docs_content;
  "features/docs/gc": typeof features_docs_gc;
  "features/docs/guards": typeof features_docs_guards;
  "features/docs/helpers": typeof features_docs_helpers;
  "features/docs/mutations": typeof features_docs_mutations;
  "features/docs/queries": typeof features_docs_queries;
  "features/docs/templates": typeof features_docs_templates;
  "features/emails/emails": typeof features_emails_emails;
  "features/emails/loops": typeof features_emails_loops;
  "features/emails/templates": typeof features_emails_templates;
  "features/featureRegistry/gates": typeof features_featureRegistry_gates;
  "features/featureRegistry/queries": typeof features_featureRegistry_queries;
  "features/featureRegistry/resolver": typeof features_featureRegistry_resolver;
  "features/files/blobStore": typeof features_files_blobStore;
  "features/files/crypto": typeof features_files_crypto;
  "features/files/helpers": typeof features_files_helpers;
  "features/files/mutations": typeof features_files_mutations;
  "features/files/queries": typeof features_files_queries;
  "features/files/values": typeof features_files_values;
  "features/integrations/dispatch": typeof features_integrations_dispatch;
  "features/integrations/messages": typeof features_integrations_messages;
  "features/integrations/notify": typeof features_integrations_notify;
  "features/integrations/queue": typeof features_integrations_queue;
  "features/integrations/webhooks": typeof features_integrations_webhooks;
  "features/organizations/invitations": typeof features_organizations_invitations;
  "features/organizations/memberSessions": typeof features_organizations_memberSessions;
  "features/organizations/mutations": typeof features_organizations_mutations;
  "features/organizations/queries": typeof features_organizations_queries;
  "features/organizations/roleOptions": typeof features_organizations_roleOptions;
  "features/organizations/securityHold": typeof features_organizations_securityHold;
  "features/organizations/tombstones": typeof features_organizations_tombstones;
  "features/permissions/accountPermissions/mutations": typeof features_permissions_accountPermissions_mutations;
  "features/permissions/accountPermissions/queries": typeof features_permissions_accountPermissions_queries;
  "features/permissions/revocationEvents": typeof features_permissions_revocationEvents;
  "features/permissions/variablePermissions/cleanup": typeof features_permissions_variablePermissions_cleanup;
  "features/permissions/variablePermissions/queries": typeof features_permissions_variablePermissions_queries;
  "features/projects/favorites": typeof features_projects_favorites;
  "features/projects/helpers": typeof features_projects_helpers;
  "features/projects/members": typeof features_projects_members;
  "features/projects/mutations": typeof features_projects_mutations;
  "features/projects/queries": typeof features_projects_queries;
  "features/projects/tags": typeof features_projects_tags;
  "features/projects/templates": typeof features_projects_templates;
  "features/sharing/cleanup": typeof features_sharing_cleanup;
  "features/sharing/helpers": typeof features_sharing_helpers;
  "features/sharing/mutations": typeof features_sharing_mutations;
  "features/sharing/queries": typeof features_sharing_queries;
  "features/support/contactMessages": typeof features_support_contactMessages;
  "features/support/supportTickets": typeof features_support_supportTickets;
  "features/users/deviceSessions": typeof features_users_deviceSessions;
  "features/users/preferences": typeof features_users_preferences;
  "features/users/projectAccess": typeof features_users_projectAccess;
  "features/users/users": typeof features_users_users;
  "features/variables/helpers": typeof features_variables_helpers;
  "features/variables/mutations": typeof features_variables_mutations;
  "features/variables/queries": typeof features_variables_queries;
  "features/variables/requests/actions": typeof features_variables_requests_actions;
  "features/variables/requests/helpers": typeof features_variables_requests_helpers;
  "features/variables/requests/mutations": typeof features_variables_requests_mutations;
  "features/variables/requests/queries": typeof features_variables_requests_queries;
  "features/variables/rotation": typeof features_variables_rotation;
  "features/variables/share": typeof features_variables_share;
  "features/variables/values": typeof features_variables_values;
  "features/vault/gc": typeof features_vault_gc;
  "features/vault/reveal": typeof features_vault_reveal;
  "features/vault/vault": typeof features_vault_vault;
  "lib/audit": typeof lib_audit;
  "lib/authHelpers": typeof lib_authHelpers;
  "lib/authz": typeof lib_authz;
  "lib/capabilities": typeof lib_capabilities;
  "lib/fileLimits": typeof lib_fileLimits;
  "lib/identity": typeof lib_identity;
  "lib/integrationLimits": typeof lib_integrationLimits;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/roleCompat": typeof lib_roleCompat;
  "lib/roleProfiles": typeof lib_roleProfiles;
  "lib/seedData": typeof lib_seedData;
  "lib/users": typeof lib_users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
      getValue: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          key?: string;
          name: string;
          sampleShards?: number;
        },
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          shard: number;
          ts: number;
          value: number;
        }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
    time: {
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
    };
  };
  workflow: {
    event: {
      create: FunctionReference<
        "mutation",
        "internal",
        { name: string; workflowId: string },
        string
      >;
      send: FunctionReference<
        "mutation",
        "internal",
        {
          eventId?: string;
          name?: string;
          result:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId?: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        string
      >;
    };
    journal: {
      load: FunctionReference<
        "query",
        "internal",
        { shortCircuit?: boolean; workflowId: string },
        {
          blocked?: boolean;
          journalEntries: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          ok: boolean;
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      startSteps: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          steps: Array<{
            retry?:
              | boolean
              | { base: number; initialBackoffMs: number; maxAttempts: number };
            schedulerOptions?: { runAt?: number } | { runAfter?: number };
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
          }>;
          workflowId: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        Array<{
          _creationTime: number;
          _id: string;
          step:
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                functionType: "query" | "mutation" | "action";
                handle: string;
                inProgress: boolean;
                kind?: "function";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workId?: string;
              }
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                handle: string;
                inProgress: boolean;
                kind: "workflow";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workflowId?: string;
              }
            | {
                args: { eventId?: string };
                argsSize: number;
                completedAt?: number;
                eventId?: string;
                inProgress: boolean;
                kind: "event";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
              };
          stepNumber: number;
          workflowId: string;
        }>
      >;
    };
    workflow: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { workflowId: string },
        null
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { workflowId: string },
        boolean
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          runResult:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId: string;
        },
        null
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          maxParallelism?: number;
          onComplete?: { context?: any; fnHandle: string };
          startAsync?: boolean;
          workflowArgs: any;
          workflowHandle: string;
          workflowName: string;
        },
        string
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { workflowId: string },
        {
          inProgress: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            context?: any;
            name?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listByName: FunctionReference<
        "query",
        "internal",
        {
          name: string;
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            context?: any;
            name?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listSteps: FunctionReference<
        "query",
        "internal",
        {
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          workflowId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            completedAt?: number;
            eventId?: string;
            kind: "function" | "workflow" | "event";
            name: string;
            nestedWorkflowId?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt: number;
            stepId: string;
            stepNumber: number;
            workId?: string;
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
    };
  };
  workpool: {
    config: {
      update: FunctionReference<
        "mutation",
        "internal",
        {
          logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          maxParallelism?: number;
        },
        any
      >;
    };
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        {
          before?: number;
          limit?: number;
          logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
        },
        any
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
          };
          fnArgs: any;
          fnHandle: string;
          fnName: string;
          fnType: "action" | "mutation" | "query";
          onComplete?: { context?: any; fnHandle: string };
          retryBehavior?: {
            base: number;
            initialBackoffMs: number;
            maxAttempts: number;
          };
          runAt: number;
        },
        string
      >;
      enqueueBatch: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
          };
          items: Array<{
            fnArgs: any;
            fnHandle: string;
            fnName: string;
            fnType: "action" | "mutation" | "query";
            onComplete?: { context?: any; fnHandle: string };
            retryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            runAt: number;
          }>;
        },
        Array<string>
      >;
      status: FunctionReference<
        "query",
        "internal",
        { id: string },
        | { previousAttempts: number; state: "pending" }
        | { previousAttempts: number; state: "running" }
        | { state: "finished" }
      >;
      statusBatch: FunctionReference<
        "query",
        "internal",
        { ids: Array<string> },
        Array<
          | { previousAttempts: number; state: "pending" }
          | { previousAttempts: number; state: "running" }
          | { state: "finished" }
        >
      >;
    };
  };
};
