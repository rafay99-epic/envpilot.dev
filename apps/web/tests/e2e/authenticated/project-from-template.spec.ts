import { expect, test } from "@playwright/test";
import { api as convexApi } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { authedConvex } from "../convex";
import { trackClientErrors } from "./support";

// Authenticated e2e — creating a project from a template.
//
// The flow that used to post one request per variable from the browser. It is
// now one mutation that creates the project and starts a workflow, so the
// three things worth asserting are: the user lands on the project without
// waiting for the vault, every template variable eventually exists, and a
// batch that cannot be satisfied is refused as a WHOLE rather than applied
// halfway.
//
// Serial: each test creates a real project and the cleanup at the end removes
// them, so they must not interleave.

test.skip(!hasE2ECredentials, SKIP_REASON);

const STAMP = Date.now();

/** Matches STALE_PROJECT_PATTERN in cleanup.setup.ts, so a failed run is swept. */
const projectName = (suffix: string) => `E2E Project ${STAMP}${suffix}`;
const projectSlug = (suffix: string) => `e2e-project-${STAMP}${suffix}`;

test.describe.serial("create a project from a template", () => {
  const created: Id<"projects">[] = [];

  test.afterAll(async ({ request }) => {
    if (created.length === 0) return;
    const convex = await authedConvex(request);
    for (const projectId of created) {
      await convex
        .mutation(convexApi.features.projects.mutations.remove, { projectId })
        .catch(() => undefined);
    }
  });

  test("provisions every template variable and lands on the project", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    const name = projectName("a");
    const slug = projectSlug("a");

    await page.goto("/dashboard/projects/new", {
      waitUntil: "domcontentloaded",
    });

    // Pick the first template card; the spec is about the flow, not about
    // which template, so it must not break when the catalogue changes.
    const templateCard = page
      .getByRole("button")
      .filter({ hasText: /variables? included|Next\.js|React|Express/i })
      .first();
    const hasTemplates = await templateCard
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasTemplates, "no templates rendered in the selector");
    await templateCard.click();

    await page.getByLabel("Project Name").fill(name);
    await page.getByLabel("Slug").fill(slug);
    await page.getByRole("button", { name: "Create Project" }).click();

    // The whole point of the rewrite: navigation does not wait for N vault
    // writes. 20s is generous for one mutation and still far under the
    // several seconds per variable the old loop took.
    await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${slug}$`), {
      timeout: 20_000,
    });

    const convex = await authedConvex(page.request);
    const projects = (await convex.query(
      convexApi.features.projects.queries.listForUser,
      {}
    )) as Array<{ _id: Id<"projects">; slug: string }>;
    const project = projects.find((p) => p.slug === slug);
    expect(project, "the project row exists").toBeTruthy();
    created.push(project!._id);

    // Variables land in ONE transaction, so this goes from zero to the full
    // set with nothing in between. Poll for the commit, then assert the count
    // is stable rather than merely non-zero.
    await expect
      .poll(
        async () => {
          const rows = (await convex.query(
            convexApi.features.variables.queries.listWithAccess,
            { projectId: project!._id }
          )) as unknown[];
          return rows.length;
        },
        { timeout: 60_000, message: "template variables never landed" }
      )
      .toBeGreaterThan(0);

    const job = (await convex.query(
      convexApi.features.variables.bulkJobs.latestForProject,
      { projectId: project!._id }
    )) as { status: string; total: number; completed: number } | null;
    expect(job, "a bulk job was recorded").toBeTruthy();
    await expect
      .poll(
        async () => {
          const current = (await convex.query(
            convexApi.features.variables.bulkJobs.latestForProject,
            { projectId: project!._id }
          )) as { status: string } | null;
          return current?.status;
        },
        { timeout: 60_000 }
      )
      .toBe("completed");

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("a batch defining one key twice for the same environment is refused whole", async ({
    request,
  }) => {
    const convex = await authedConvex(request);
    const organizations = (await convex.query(
      convexApi.features.organizations.queries.listForUser,
      {}
    )) as Array<{ _id: Id<"organizations">; role: string }>;
    const ownedOrg = organizations.find((o) => o.role === "owner");
    test.skip(!ownedOrg, "the test user owns no organization");

    const slug = projectSlug("b");
    await expect(
      convex.mutation(
        convexApi.features.projects.fromTemplate.startFromTemplate,
        {
          name: projectName("b"),
          slug,
          organizationId: ownedOrg!._id,
          variables: [
            {
              key: "E2E_DUPLICATE",
              environments: ["development"],
              defaultValue: "one",
            },
            {
              key: "E2E_DUPLICATE",
              environments: ["development", "staging"],
              defaultValue: "two",
            },
          ],
        }
      )
    ).rejects.toThrow(/more than once for environment/i);

    // Refused as a whole: the mutation is transactional, so the project row
    // must not survive the rejection either.
    const projects = (await convex.query(
      convexApi.features.projects.queries.listForUser,
      {}
    )) as Array<{ slug: string }>;
    expect(
      projects.some((p) => p.slug === slug),
      "the rejected batch left no project behind"
    ).toBe(false);
  });

  test("the same key across disjoint environments is allowed", async ({
    request,
  }) => {
    const convex = await authedConvex(request);
    const organizations = (await convex.query(
      convexApi.features.organizations.queries.listForUser,
      {}
    )) as Array<{ _id: Id<"organizations">; role: string }>;
    const ownedOrg = organizations.find((o) => o.role === "owner");
    test.skip(!ownedOrg, "the test user owns no organization");

    const { projectId } = await convex.mutation(
      convexApi.features.projects.fromTemplate.startFromTemplate,
      {
        name: projectName("c"),
        slug: projectSlug("c"),
        organizationId: ownedOrg!._id,
        variables: [
          {
            key: "E2E_DISJOINT",
            environments: ["development"],
            defaultValue: "dev",
          },
          {
            key: "E2E_DISJOINT",
            environments: ["production"],
            defaultValue: "prod",
          },
        ],
      }
    );
    created.push(projectId);

    await expect
      .poll(
        async () => {
          const rows = (await convex.query(
            convexApi.features.variables.queries.listWithAccess,
            { projectId }
          )) as Array<{ key: string }>;
          return rows.filter((r) => r.key === "E2E_DISJOINT").length;
        },
        { timeout: 60_000, message: "disjoint-environment pair never landed" }
      )
      .toBe(2);
  });
});
