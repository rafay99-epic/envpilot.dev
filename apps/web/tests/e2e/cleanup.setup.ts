import { test as setup } from "@playwright/test";

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
 * Runs through the real authenticated REST API (same session storage state
 * as the specs), so deletes follow the product's soft-delete path — trashed
 * rows keep their restore window and the vault GC cron purges them after
 * retention, exactly as user-initiated deletes would.
 */

/** Variable keys created by the suite — every helper/spec uses this prefix. */
const STALE_VARIABLE_PATTERN = /^E2E_/;

/**
 * Throwaway projects created by specs (e.g. "E2E Project 1783187010288").
 * Deliberately anchored so the permanent "E2E Fixture Project" never matches.
 */
const STALE_PROJECT_PATTERN = /^E2E Project \d+$/;

const BULK_DELETE_MAX = 50; // /api/variables/bulk-delete caps ids per call

setup("purge stale E2E data from the fixture org", async ({ request }) => {
  setup.skip(!hasE2ECredentials, SKIP_REASON);
  setup.setTimeout(120_000);

  const orgsResponse = await request.get("/api/organizations");
  if (!orgsResponse.ok()) {
    throw new Error(
      `cleanup: GET /api/organizations failed (${orgsResponse.status()}) — ` +
        "is the saved auth session still valid?"
    );
  }
  const { organizations } = (await orgsResponse.json()) as {
    organizations: Array<{ _id: string; name: string; role: string }>;
  };

  let deletedVariables = 0;
  let deletedProjects = 0;

  // Only sweep orgs the test account owns — the fixture org. Never touch
  // orgs the account was merely invited into.
  for (const org of organizations.filter((o) => o.role === "owner")) {
    const projectsResponse = await request.get(
      `/api/projects?organizationId=${org._id}`
    );
    if (!projectsResponse.ok()) {
      throw new Error(
        `cleanup: GET /api/projects for org "${org.name}" failed ` +
          `(${projectsResponse.status()})`
      );
    }
    const { projects } = (await projectsResponse.json()) as {
      projects: Array<{ _id: string; name: string }>;
    };

    for (const project of projects) {
      // Leftover throwaway project from a failed run — delete it whole.
      if (STALE_PROJECT_PATTERN.test(project.name)) {
        const res = await request.delete(`/api/projects/${project._id}`);
        if (res.ok()) deletedProjects += 1;
        continue;
      }

      const variablesResponse = await request.get(
        `/api/variables?projectId=${project._id}`
      );
      if (!variablesResponse.ok()) {
        throw new Error(
          `cleanup: GET /api/variables for project "${project.name}" failed ` +
            `(${variablesResponse.status()})`
        );
      }
      const { variables } = (await variablesResponse.json()) as {
        variables: Array<{ _id: string; key: string }>;
      };

      const staleIds = variables
        .filter((v) => STALE_VARIABLE_PATTERN.test(v.key))
        .map((v) => v._id);

      for (let i = 0; i < staleIds.length; i += BULK_DELETE_MAX) {
        const chunk = staleIds.slice(i, i + BULK_DELETE_MAX);
        const res = await request.post("/api/variables/bulk-delete", {
          data: { variableIds: chunk, projectId: project._id },
        });
        if (!res.ok()) {
          throw new Error(
            `cleanup: bulk-delete of ${chunk.length} stale variables in ` +
              `"${project.name}" failed (${res.status()}): ${await res.text()}`
          );
        }
        deletedVariables += chunk.length;
      }
    }
  }

  setup.info().annotations.push({
    type: "note",
    description:
      `purged ${deletedVariables} stale E2E variable(s) and ` +
      `${deletedProjects} stale E2E project(s)`,
  });
});
