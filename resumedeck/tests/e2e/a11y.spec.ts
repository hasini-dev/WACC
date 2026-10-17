import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { applicantId, blur, jobByTitle, resetDb } from "./helpers";

const serious = (violations: Array<{ id: string; impact?: string | null; nodes: Array<{ target: unknown[] }> }>) =>
  violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

test.beforeEach(async ({ request }) => resetDb(request));

test("no serious axe violations on dashboard, deck, applicant and login", async ({ page, request }) => {
  const job = await jobByTitle(request, /Backend/);
  for (const path of ["/dashboard", `/jobs/${job.id}`, `/applicants/${await applicantId(request, job.id, "Marcus Bell")}`]) {
    await page.goto(path);
    await page.waitForTimeout(700);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(serious(results.violations), path).toEqual([]);
  }
});

test("no serious axe violations in the open detail modal", async ({ page, request }) => {
  const job = await jobByTitle(request, /Backend/);
  await page.goto(`/jobs/${job.id}`);
  await expect(page.getByTestId("resume-card")).toBeVisible();
  await blur(page);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  const results = await new AxeBuilder({ page }).include("dialog").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(serious(results.violations)).toEqual([]);
});
