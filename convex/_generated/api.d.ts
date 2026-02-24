/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auditHelpers from "../auditHelpers.js";
import type * as auditLogs from "../auditLogs.js";
import type * as changelog from "../changelog.js";
import type * as cliSessions from "../cliSessions.js";
import type * as dashboard from "../dashboard.js";
import type * as featureRequests from "../featureRequests.js";
import type * as invitations from "../invitations.js";
import type * as organizations from "../organizations.js";
import type * as permissionRevocationEvents from "../permissionRevocationEvents.js";
import type * as permissions from "../permissions.js";
import type * as projectAccess from "../projectAccess.js";
import type * as projects from "../projects.js";
import type * as seedChangelog from "../seedChangelog.js";
import type * as subscriptions from "../subscriptions.js";
import type * as templates from "../templates.js";
import type * as tierLimits from "../tierLimits.js";
import type * as users from "../users.js";
import type * as variables from "../variables.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auditHelpers: typeof auditHelpers;
  auditLogs: typeof auditLogs;
  changelog: typeof changelog;
  cliSessions: typeof cliSessions;
  dashboard: typeof dashboard;
  featureRequests: typeof featureRequests;
  invitations: typeof invitations;
  organizations: typeof organizations;
  permissionRevocationEvents: typeof permissionRevocationEvents;
  permissions: typeof permissions;
  projectAccess: typeof projectAccess;
  projects: typeof projects;
  seedChangelog: typeof seedChangelog;
  subscriptions: typeof subscriptions;
  templates: typeof templates;
  tierLimits: typeof tierLimits;
  users: typeof users;
  variables: typeof variables;
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

export declare const components: {};
