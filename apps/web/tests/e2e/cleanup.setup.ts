import { test as setup } from "@playwright/test";
import { api as convexApi } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { authedConvex } from "./convex";
import { hasE2ECredentials, SKIP_REASON } from "./env";

/**
 * Cleanup project: sweeps stale E2E test data out of the fixture org BEFORE
 * the authenticated specs run.
 *
 * Why this exists: every spec creates uniquely-named `E2E_*` variables and
 * cleans up after itself — but a spec that FAILS (or a run that's aborted)
 * skips its own cleanup. That debris accumulates across runs until the
 * fixture project hits the free-tier `max_variables_per_project` cap (50),
 * at which point the Add Variable drawer renders the Upgrade prompt instead
 * of the form and every variable-creating spec times out. This sweep resets
 * the fixture to a clean baseline so one bad run can't poison the next.
 *
 * Runs through authenticated product surfaces. Variables/projects use their
 * surviving REST adapters; tags use the real settings UI and native Convex
 * mutation. Deletes follow the same soft-delete paths users trigger.
 */

/** Variable keys created by the suite — every helper/spec uses this prefix. */
const STALE_VARIABLE_PATTERN = /^E2E_/;

/** Tags created by sharing-tags-export.spec.ts (uniqueTagName). */
const STALE_TAG_PATTERN = /^e2e-tag-/;

/**
 * Only purge fixtures older than this. A concurrent suite run (another
 * terminal, CI) creates variables/tags seconds before using them — an
 * age-blind sweep here deletes them out from under that run's assertions
 * (this actually happened: one run's cleanup emptied another run's export).
 * Real debris is hours old; 30 minutes is far beyond any single run.
 */
const STALE_AGE_MS = 30 * 60 * 1000;

/**
 * Throwaway projects created by specs (e.g. "E2E Project 1783187010288").
 * Deliberately anchored so the permanent "E2E Fixture Project" never matches.
 */
const STALE_PROJECT_PATTERN = /^E2E Project \d+$/;

const BULK_DELETE_MAX = 50; // variables.bulkDelete caps ids per call
const TAG_CLEANUP_MAX = 15; // leave headroom under tagMutate's 20/minute limit
const CLEANUP_TITLE = "purge stale E2E data from the fixture org";

/** Convex surfaces user-facing text in a ConvexError payload, not `message`. */
function messageOf(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    return String((error as { data: unknown }).data);
  }
  return error instanceof Error ? error.message : String(error);
}

setup(CLEANUP_TITLE, async ({ request, page }) => {
  setup.skip(!hasE2ECredentials, SKIP_REASON);
  setup.setTimeout(120_000);

  const convex = await authedConvex(request);

  const organizations = (await convex.query(
    convexApi.features.organizations.queries.listForUser,
    {}
  )) as Array<{
    _id: Id<"organizations">;
    name: string;
    slug: string;
    role: string;
  }>;

  let deletedVariables = 0;
  let deletedProjects = 0;
  let deletedTags = 0;
  // Best-effort deletes never fail the run, but they must not fail silently
  // either — collected here and surfaced as a console warning + report
  // annotation so leftover debris is traceable to its cause.
  const warnings: string[] = [];

  // Only sweep orgs the test account owns — the fixture org. Never touch
  // orgs the account was merely invited into.
  for (const org of organizations.filter((o) => o.role === "owner")) {
    // Stale org-scoped tags (each tags-spec run creates one; failed runs
    // never delete it, and 40+ accumulated tags slow the picker down).
    await page.goto(`/organizations/${org.slug}/settings?tab=tags`, {
      waitUntil: "domcontentloaded",
    });
    const tagsAvailable = await page
      .getByText("Variable Tags", { exact: true })
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    let hasNextPage = tagsAvailable;
    if (!tagsAvailable) {
      warnings.push(
        `tag cleanup unavailable for org "${org.name}" — feature may be gated`
      );
    }
    while (hasNextPage) {
      if (deletedTags >= TAG_CLEANUP_MAX) {
        warnings.push(
          `tag cleanup stopped after ${TAG_CLEANUP_MAX} deletions to avoid rate limiting`
        );
        break;
      }

      const rows = page.getByTestId("tag-row");
      const rowCount = await rows.count();
      let deletedOnPage = false;

      for (let index = 0; index < rowCount; index++) {
        const row = rows.nth(index);
        const text = (await row.textContent()) ?? "";
        const match = text.match(/e2e-tag-(\d+)-\d+/);
        if (
          !match ||
          !STALE_TAG_PATTERN.test(match[0]) ||
          Number(match[1]) >= Date.now() - STALE_AGE_MS
        ) {
          continue;
        }

        try {
          await row.getByTitle("Delete tag").click();
          await row
            .getByRole("button", { name: "Delete", exact: true })
            .click();
          await row.waitFor({ state: "detached" });
          deletedTags += 1;
          deletedOnPage = true;
        } catch {
          warnings.push(`tag "${match[0]}" not deleted — will retry next run`);
          hasNextPage = false;
        }
        break;
      }

      if (deletedOnPage) continue;
      if (!hasNextPage) break;
      const next = page.getByRole("button", { name: "Next page" });
      hasNextPage = await next.isEnabled().catch(() => false);
      if (hasNextPage) await next.click();
    }

    const projects = (await convex.query(
      convexApi.features.projects.queries.listWithStats,
      { organizationId: org._id }
    )) as Array<{ _id: Id<"projects">; name: string }>;

    for (const project of projects) {
      // Leftover throwaway project from a failed run — delete it whole once
      // it's old enough to be certainly not a concurrent run's (its name
      // embeds its Date.now() creation stamp).
      if (STALE_PROJECT_PATTERN.test(project.name)) {
        const createdAt = Number(project.name.replace(/^E2E Project /, ""));
        if (createdAt < Date.now() - STALE_AGE_MS) {
          try {
            await convex.mutation(
              convexApi.features.projects.mutations.remove,
              { projectId: project._id }
            );
            deletedProjects += 1;
          } catch (error) {
            warnings.push(
              `stale project "${project.name}" not deleted ` +
                `(${messageOf(error)}) — will retry next run`
            );
          }
        }
        continue;
      }

      const variables = (await convex.query(
        convexApi.features.variables.queries.listWithAccess,
        { projectId: project._id }
      )) as Array<{
        _id: Id<"environmentVariables">;
        key: string;
        _creationTime: number;
        hasAccess: boolean;
      }>;

      const staleIds = variables
        .filter((v) => v.hasAccess)
        .filter(
          (v) =>
            STALE_VARIABLE_PATTERN.test(v.key) &&
            v._creationTime < Date.now() - STALE_AGE_MS
        )
        .map((v) => v._id);

      for (let i = 0; i < staleIds.length; i += BULK_DELETE_MAX) {
        const chunk = staleIds.slice(i, i + BULK_DELETE_MAX);
        try {
          await convex.mutation(
            convexApi.features.variables.mutations.bulkDelete,
            { variableIds: chunk }
          );
          deletedVariables += chunk.length;
        } catch (error) {
          const body = messageOf(error);
          // "Variable not found" = an id vanished between our list fetch and
          // this call (e.g. a concurrent run already deleted it) — bulkDelete
          // validates only the chunk's first id, so fall back to per-id
          // deletes and ignore the ones that are already gone.
          if (!/Variable not found/i.test(body)) {
            throw new Error(
              `cleanup: bulk-delete of ${chunk.length} stale variables in ` +
                `"${project.name}" failed: ${body}`
            );
          }
          for (const id of chunk) {
            try {
              await convex.mutation(
                convexApi.features.variables.mutations.remove,
                { variableId: id }
              );
              deletedVariables += 1;
            } catch (singleError) {
              const single = messageOf(singleError);
              // "not found" = already gone (the goal); anything else is a
              // real skip worth surfacing.
              if (!/not found/i.test(single)) {
                warnings.push(
                  `variable ${id} in "${project.name}" not deleted ` +
                    `(${single}) — will retry next run`
                );
              }
            }
          }
        }
      }
    }
  }

  setup.info().annotations.push({
    type: "note",
    description:
      `purged ${deletedVariables} stale E2E variable(s), ` +
      `${deletedProjects} stale E2E project(s), and ` +
      `${deletedTags} stale e2e tag(s)`,
  });
  if (warnings.length > 0) {
    for (const warning of warnings) console.warn(`cleanup: ${warning}`);
    setup.info().annotations.push({
      type: "warning",
      description: `cleanup skipped ${warnings.length} item(s): ${warnings.join("; ")}`,
    });
  }
});
