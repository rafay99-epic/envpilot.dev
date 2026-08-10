import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON, STORAGE_STATE_PATH } from "../env";
import { getWorkerProjectSlug, trackClientErrors } from "./support";

/**
 * Authenticated e2e — documentation sharing, both audiences.
 *
 * The properties under test are the ones the feature rests on:
 *
 *   1. A DRAFT cannot be shared. Publication is the single human review gate
 *      and a share must not route around it.
 *   2. A public link is readable with NO session at all — that is the whole
 *      point — and carries `X-Robots-Tag: noindex`.
 *   3. A passphrase-protected link refuses a wrong guess, and an unknown
 *      token gets the SAME answer as a wrong guess. The unlock endpoint must
 *      never confirm that a token exists.
 *   4. Revoking kills a live link immediately.
 *   5. Unpublishing kills every live link for that page — the gate chain is
 *      re-evaluated per read, not trusted from create time.
 *
 * Serial: each test builds on the page and link the earlier ones create.
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

const STAMP = Date.now();
const MODULE_NAME = `E2E Share ${STAMP}`;
const TITLE = `E2E Shared Page ${STAMP}`;
const BODY = [
  "# Shared page",
  "",
  "This page exists to be shared in an end-to-end test.",
  "",
].join("\n");

const PASSPHRASE = "correct-horse-battery";
const APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const DAY_MS = 24 * 3_600_000;

test.describe.serial("Documentation sharing", () => {
  let projectSlug = "";
  let docSlug = "";
  let plainToken = "";
  let lockedToken = "";

  test("a draft cannot be shared", async ({ page }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    projectSlug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${projectSlug}/docs/new`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-title-input").fill(TITLE);
    await page.getByTestId("doc-module-input").fill(MODULE_NAME);
    await page.getByTestId("doc-type-guide").click();
    await page.getByTestId("doc-create-submit").click();

    await expect(page.getByTestId("doc-title")).toHaveText(TITLE, {
      timeout: 20_000,
    });
    docSlug = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(docSlug.length).toBeGreaterThan(0);

    // The button is absent on a draft — there is nothing to share yet.
    await expect(page.getByTestId("doc-share")).toHaveCount(0);

    // Give it a body, then publish. Publishing is what makes it shareable.
    await page.getByTestId("doc-edit").click();
    await page.getByTestId("doc-body-input").fill(BODY);
    await page.getByTestId("doc-save").click();
    await page.getByTestId("doc-publish").click();

    await expect(page.getByTestId("doc-share")).toBeVisible({
      timeout: 20_000,
    });

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("returning a page to draft withdraws the ability to share it", async ({
    page,
  }) => {
    test.skip(!docSlug, "no page from the first test");

    await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
      waitUntil: "domcontentloaded",
    });

    // Unpublish and the affordance goes with it. The backend refuses a draft
    // independently (loadShareableDoc), and the "unpublishing kills every
    // live link" test below proves the read path agrees — this asserts the
    // UI never offers an action the mutation would reject.
    await page.getByTestId("doc-unpublish").click();
    await expect(page.getByTestId("doc-publish")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("doc-share")).toHaveCount(0);

    // Put it back so the rest of the suite has something to share.
    await page.getByTestId("doc-publish").click();
    await expect(page.getByTestId("doc-share")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("a public link is readable with no session and is not indexable", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    test.skip(!docSlug, "no page from the first test");

    await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-share").click();

    const publicTab = page.getByRole("button", { name: /public link/i });
    if ((await publicTab.count()) === 0) {
      test.skip(
        true,
        "this account cannot create public links (capability or tier)"
      );
    }
    await publicTab.click();
    await page.getByRole("button", { name: /create public link/i }).click();

    const linkField = page.locator("input[readonly]");
    await expect(linkField).toBeVisible({ timeout: 20_000 });
    const url = await linkField.inputValue();
    expect(url).toContain("/d/dshr_");
    plainToken = url.split("/d/")[1];

    // A brand new context with NO storage state — an outside reader.
    const anon = await browser.newContext({
      storageState: undefined,
      baseURL: APP_ORIGIN,
    });
    try {
      const anonPage = await anon.newPage();
      // Navigated by PATH against the suite's origin, not by the absolute URL
      // the drawer produced. The link's origin comes from NEXT_PUBLIC_APP_URL,
      // which is a deployment setting — a local value of https://localhost:3000
      // would fail here for reasons that have nothing to do with sharing. The
      // shape of that URL is asserted above; this navigates the product.
      const response = await anonPage.goto(new URL(url).pathname, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBeLessThan(400);
      await expect(anonPage.getByText(TITLE)).toBeVisible({ timeout: 20_000 });

      // The API that feeds the page must refuse to be indexed too.
      const api = await anon.request.get(`/api/doc-shares/${plainToken}`);
      expect(api.status()).toBe(200);
      expect(api.headers()["x-robots-tag"]).toContain("noindex");
    } finally {
      await anon.close();
    }
  });

  test("the drawer keeps focus while typing an email", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!docSlug, "no page from the first test");

    // Regression: DrawerPanel's focus effect used to depend on the keydown
    // handler, whose identity changes whenever the caller re-renders. A
    // drawer that holds its own form state re-renders on every keystroke, so
    // the effect tore down mid-typing and its cleanup pulled focus back to
    // the trigger — you got three or four characters in and lost the rest.
    await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-share").click();

    const publicTab = page.getByRole("button", { name: /public link/i });
    if ((await publicTab.count()) === 0) {
      test.skip(true, "no public-link capability on this account");
    }
    await publicTab.click();

    const email = page.locator('input[type="email"]');
    await expect(email).toBeVisible({ timeout: 20_000 });
    await email.click();

    // Typed key by key, NOT filled: `fill` sets the value in one shot and
    // would sail past a focus-stealing re-render between keystrokes.
    const address = "99marafay@gmail.com";
    await page.keyboard.type(address, { delay: 30 });

    await expect(email).toHaveValue(address);
    // And focus is still in the field, so the next character would land too.
    await expect(email).toBeFocused();
  });

  test("a wrong passphrase and an unknown token are indistinguishable", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    test.skip(!docSlug, "no page from the first test");

    await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-share").click();
    const publicTab = page.getByRole("button", { name: /public link/i });
    if ((await publicTab.count()) === 0) {
      test.skip(true, "no public-link capability on this account");
    }
    await publicTab.click();

    // A checkbox inside a label, not a button — the label text is its
    // accessible name.
    await page.getByRole("checkbox", { name: /require a passphrase/i }).check();
    await page.locator('input[placeholder^="At least"]').fill(PASSPHRASE);
    await page.getByRole("button", { name: /create public link/i }).click();

    const linkField = page.locator("input[readonly]");
    await expect(linkField).toBeVisible({ timeout: 20_000 });
    lockedToken = (await linkField.inputValue()).split("/d/")[1];

    const anon = await browser.newContext({
      storageState: undefined,
      baseURL: APP_ORIGIN,
    });
    try {
      // Wrong passphrase on a real token.
      const wrong = await anon.request.post(
        `/api/doc-shares/${lockedToken}/unlock`,
        { data: { passphrase: "definitely-not-it" }, failOnStatusCode: false }
      );
      // A token that does not exist at all.
      const unknown = await anon.request.post(
        `/api/doc-shares/dshr_${"0".repeat(64)}/unlock`,
        { data: { passphrase: "definitely-not-it" }, failOnStatusCode: false }
      );

      expect(wrong.status()).toBe(401);
      expect(unknown.status()).toBe(401);
      // Same status AND same body: the endpoint is not an existence oracle.
      expect(await wrong.text()).toBe(await unknown.text());

      // The right passphrase opens it.
      const right = await anon.request.post(
        `/api/doc-shares/${lockedToken}/unlock`,
        { data: { passphrase: PASSPHRASE }, failOnStatusCode: false }
      );
      expect(right.status()).toBe(200);

      const read = await anon.request.get(`/api/doc-shares/${lockedToken}`);
      expect(read.status()).toBe(200);
      expect(await read.text()).toContain(TITLE);
    } finally {
      await anon.close();
    }
  });

  test("revoking kills a live link", async ({ page, browser }) => {
    test.setTimeout(120_000);
    test.skip(
      !plainToken || !lockedToken,
      "no public links from the earlier tests"
    );

    await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
      waitUntil: "domcontentloaded",
    });

    // Target the row for `plainToken` specifically — revoking whichever entry
    // happens to sort first proves nothing about the token this test then
    // reads. Both public rows read "Anyone with the link"; only the
    // passphrase one carries the lock, so the row without it is this token's.
    const plainRow = page
      .locator("li")
      .filter({ hasText: /anyone with the link/i })
      .filter({ hasNot: page.locator('[aria-label="Passphrase protected"]') });
    await expect(plainRow).toHaveCount(1, { timeout: 20_000 });

    const before = await page
      .getByRole("button", { name: /^revoke access/i })
      .count();
    await plainRow.getByRole("button", { name: /^revoke access/i }).click();
    await expect(
      page.getByRole("button", { name: /^revoke access/i })
    ).toHaveCount(before - 1, { timeout: 20_000 });

    const anon = await browser.newContext({
      storageState: undefined,
      baseURL: APP_ORIGIN,
    });
    try {
      const dead = await anon.request.get(`/api/doc-shares/${plainToken}`, {
        failOnStatusCode: false,
      });
      const missing = await anon.request.get(
        `/api/doc-shares/dshr_${"0".repeat(64)}`,
        { failOnStatusCode: false }
      );
      // A revoked token answers exactly like one that never existed.
      expect(dead.status()).toBe(404);
      expect(await dead.text()).toBe(await missing.text());

      // And the OTHER link is untouched — 401 (locked, awaiting a passphrase)
      // rather than 404. This is what makes the row targeting above a fact
      // instead of an assumption: revoking the wrong one fails here.
      const survivor = await anon.request.get(
        `/api/doc-shares/${lockedToken}`,
        { failOnStatusCode: false }
      );
      expect(survivor.status()).toBe(401);
    } finally {
      await anon.close();
    }
  });

  test("unpublishing kills every live link for the page", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    test.skip(!lockedToken, "no passphrase link from the earlier test");

    await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-unpublish").click();
    await expect(page.getByTestId("doc-publish")).toBeVisible({
      timeout: 20_000,
    });

    const anon = await browser.newContext({
      storageState: undefined,
      baseURL: APP_ORIGIN,
    });
    try {
      // Even holding a verified passphrase cookie would not help — the page
      // is no longer published, and that is checked on every read.
      const read = await anon.request.get(`/api/doc-shares/${lockedToken}`, {
        failOnStatusCode: false,
      });
      expect(read.status()).toBe(404);
    } finally {
      await anon.close();
    }
  });

  test("sharing with a teammate grants exactly one page", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!docSlug, "no page from the first test");

    await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-publish").click();
    await expect(page.getByTestId("doc-share")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("doc-share").click();

    const checkboxes = page.locator('input[type="checkbox"]');
    // The e2e organization is frequently a single-member org — there is
    // nobody to share with, and that is not a failure.
    const memberBoxes = await checkboxes.count();
    if (memberBoxes === 0) {
      test.skip(true, "no other members in the e2e organization");
    }

    await checkboxes.first().check();
    await page.getByRole("button", { name: /^share with/i }).click();

    // Success is reported, and the recipient appears in the shares list.
    await expect(page.getByText(/shared with 1 person/i)).toBeVisible({
      timeout: 20_000,
    });

    // Re-sharing the same page to the same person must NOT stack a row.
    const listed = await page
      .getByRole("button", { name: /^revoke access/i })
      .count();
    await checkboxes.first().check();
    await page.getByRole("button", { name: /^share with/i }).click();
    await expect(page.getByText(/already had access/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: /^revoke access/i })
    ).toHaveCount(listed);
  });

  test("a module link serves an index and its pages", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    test.skip(!docSlug, "no page from the first test");

    // One share, one link, every published page in the module — the whole
    // reason module scope exists is that the alternative is N shares and N
    // emails to the same person.
    await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-share").click();

    const publicTab = page.getByRole("button", { name: /public link/i });
    if ((await publicTab.count()) === 0) {
      test.skip(true, "no public-link capability on this account");
    }

    await page.getByRole("button", { name: /whole module/i }).click();
    await publicTab.click();
    await page.getByRole("button", { name: /create public link/i }).click();

    const linkField = page.locator("input[readonly]");
    await expect(linkField).toBeVisible({ timeout: 20_000 });
    const moduleToken = (await linkField.inputValue()).split("/d/")[1];

    const anon = await browser.newContext({
      storageState: undefined,
      baseURL: APP_ORIGIN,
    });
    try {
      // The index names the module and lists the page created above.
      const index = await anon.request.get(`/api/doc-shares/${moduleToken}`);
      expect(index.status()).toBe(200);
      const indexBody = (await index.json()) as {
        kind: string;
        module: { module: string; pages: Array<{ slug: string }> };
      };
      expect(indexBody.kind).toBe("module");
      expect(indexBody.module.module).toBe(MODULE_NAME);
      expect(indexBody.module.pages.map((p) => p.slug)).toContain(docSlug);

      // A page WITHIN the module opens through the same token.
      const inner = await anon.request.get(
        `/api/doc-shares/${moduleToken}?docSlug=${docSlug}`
      );
      expect(inner.status()).toBe(200);
      const innerBody = (await inner.json()) as { kind: string };
      expect(innerBody.kind).toBe("page");

      // A slug that is not in this module resolves to nothing — the module
      // list is the authority, so it is never fetched and then checked.
      const foreign = await anon.request.get(
        `/api/doc-shares/${moduleToken}?docSlug=not-in-this-module`,
        { failOnStatusCode: false }
      );
      expect(foreign.status()).toBe(404);

      // And the reader page itself renders unauthenticated.
      const anonPage = await anon.newPage();
      const response = await anonPage.goto(`/d/${moduleToken}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBeLessThan(400);
      await expect(anonPage.getByText(MODULE_NAME).first()).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await anon.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!docSlug || !projectSlug) return;
    // `browser.newPage()` builds a context from scratch: no storage state and
    // no baseURL, so the dashboard bounced to sign-in and nothing was ever
    // deleted. The saved session has to be handed over explicitly.
    const context = await browser.newContext({
      storageState: STORAGE_STATE_PATH,
      baseURL: APP_ORIGIN,
    });
    const page = await context.newPage();
    try {
      await page.goto(`/dashboard/projects/${projectSlug}/docs/${docSlug}`, {
        waitUntil: "domcontentloaded",
      });
      const remove = page.getByTestId("doc-delete");
      if (await remove.isVisible().catch(() => false)) {
        await remove.click();
        await page.getByRole("button", { name: /move to trash/i }).click();
      }
    } catch {
      // Best-effort cleanup; never fail the suite on it.
    } finally {
      await context.close();
    }
  });
});
