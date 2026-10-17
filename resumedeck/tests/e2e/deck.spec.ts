import { expect, test } from "@playwright/test";
import { applicantId, blur, dragTopCard, jobByTitle, openDeck, resetDb, topCardName, type JobRef } from "./helpers";

let backend: JobRef;
let ux: JobRef;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
  backend = await jobByTitle(request, /Backend/);
  ux = await jobByTitle(request, /UX/);
});

test("all three routes render from the pipeline's data", async ({ page, request }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your decks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Senior Backend Engineer (Java)" })).toBeVisible();

  await openDeck(page, backend);
  await expect(page.getByRole("heading", { level: 1, name: "Senior Backend Engineer (Java)" })).toBeVisible();
  // Grace (two-column PDF, 94, applied first) ties Marcus (94) and sorts ahead of him.
  await expect(topCardName(page)).toHaveText("Grace Nakamura");

  await page.goto(`/applicants/${await applicantId(request, ux.id, "Mei Chen")}`);
  await expect(page.getByRole("heading", { name: "Mei Chen", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Match breakdown" })).toBeVisible();
});

test("swipe right → undo → card returns", async ({ page }) => {
  await openDeck(page, backend);
  const first = await topCardName(page).innerText();

  await dragTopCard(page, 260);
  await expect(topCardName(page)).not.toHaveText(first);
  await expect(page.getByTestId("toast")).toContainText(`Shortlisted ${first}`);
  await expect(page.getByRole("tab", { name: /Shortlisted/ })).toContainText("1");

  await page.getByRole("group", { name: "Decision" }).getByRole("button", { name: "Undo last decision" }).click();
  await expect(topCardName(page)).toHaveText(first);
  await expect(page.getByRole("tab", { name: /Shortlisted/ })).toContainText("0");
});

test("a short drag springs back without deciding", async ({ page }) => {
  await openDeck(page, backend);
  const first = await topCardName(page).innerText();
  await dragTopCard(page, 60);
  await expect(topCardName(page)).toHaveText(first);
  await expect(page.getByRole("tab", { name: /To review/ })).toContainText("7");
});

test("decisions persist across reload and in a second browser", async ({ page, browser }) => {
  await openDeck(page, backend);
  const first = await topCardName(page).innerText();
  await blur(page);
  await page.keyboard.press("ArrowRight");
  await expect(topCardName(page)).not.toHaveText(first);
  await expect(page.getByTestId("toast")).toContainText(`Shortlisted ${first}`);

  await page.reload();
  await page.getByRole("tab", { name: /Shortlisted/ }).click();
  await expect(page.getByRole("tabpanel").getByRole("button", { name: first })).toBeVisible();

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.goto(`/jobs/${backend.id}`);
  await page2.getByRole("tab", { name: /Shortlisted/ }).click();
  await expect(page2.getByRole("tabpanel").getByRole("button", { name: first })).toBeVisible();
  await other.close();
});

test("the undo stack survives a reload", async ({ page }) => {
  await openDeck(page, backend);
  const first = await topCardName(page).innerText();
  await blur(page);
  await page.keyboard.press("ArrowLeft");
  await expect(topCardName(page)).not.toHaveText(first);
  await expect(page.getByTestId("toast")).toContainText(`Passed on ${first}`);
  // Wait for the save to land before reloading.
  await expect(page.getByTestId("toast").getByRole("button", { name: "Undo" })).toBeVisible();
  await page.waitForTimeout(400);

  await page.reload();
  await expect(page.getByTestId("resume-card")).toBeVisible();
  await blur(page);
  await page.keyboard.press("z");
  await expect(topCardName(page)).toHaveText(first);
});

test("keyboard: → shortlists, ← passes, Z undoes", async ({ page }) => {
  await openDeck(page, backend);
  const first = await topCardName(page).innerText();
  await blur(page);

  await page.keyboard.press("ArrowRight");
  await expect(topCardName(page)).not.toHaveText(first);
  const second = await topCardName(page).innerText();
  await page.keyboard.press("ArrowLeft");
  await expect(topCardName(page)).not.toHaveText(second);

  await page.keyboard.press("z");
  await expect(topCardName(page)).toHaveText(second);
  await page.keyboard.press("Backspace");
  await expect(topCardName(page)).toHaveText(first);
});

test("toast undo restores the card", async ({ page }) => {
  await openDeck(page, backend);
  const first = await topCardName(page).innerText();
  await page.getByRole("group", { name: "Decision" }).getByRole("button", { name: `Pass on ${first}` }).click();
  await expect(topCardName(page)).not.toHaveText(first);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(topCardName(page)).toHaveText(first);
});

test("clicking a card opens the detail modal with extracted text; Esc closes it", async ({ page }) => {
  await openDeck(page, backend);
  const first = await topCardName(page).innerText();
  const box = (await page.getByTestId("resume-card").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);

  const dialog = page.getByRole("dialog", { name: first });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Match breakdown" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Experience" })).toBeVisible();
  await dialog.getByText("Show extracted text").click();
  await expect(dialog.getByLabel("Extracted resume text")).toContainText("EXPERIENCE");

  await page.keyboard.press("ArrowRight"); // must not decide while the modal is open
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(topCardName(page)).toHaveText(first);
});

test("tabs list decisions and 'Move back to deck' is undoable", async ({ page }) => {
  await openDeck(page, backend);
  const first = await topCardName(page).innerText();
  await page.getByRole("group", { name: "Decision" }).getByRole("button", { name: `Shortlist ${first}` }).click();
  await expect(topCardName(page)).not.toHaveText(first);
  const second = await topCardName(page).innerText();

  await page.getByRole("tab", { name: /Shortlisted/ }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("button", { name: first })).toBeVisible();
  await panel.getByRole("button", { name: "Move back to deck" }).click();
  await expect(panel.getByText(/No one shortlisted yet/)).toBeVisible();

  await page.getByRole("tab", { name: /To review/ }).click();
  await expect(topCardName(page)).toHaveText(second); // moved-back cards never jump the top card

  await blur(page);
  await page.keyboard.press("z");
  await page.getByRole("tab", { name: /Shortlisted/ }).click();
  await expect(page.getByRole("tabpanel").getByRole("button", { name: first })).toBeVisible();
});

test("deck cleared empty state", async ({ page }) => {
  await openDeck(page, ux);
  const pass = page.getByRole("group", { name: "Decision" }).getByRole("button", { name: /^Pass/ });
  for (let i = 0; i < 4; i++) {
    await expect(pass).toBeEnabled();
    await pass.click();
  }
  await expect(page.getByText("Deck cleared")).toBeVisible();
  await expect(page.getByText("New applicants for this role will appear here as they arrive.")).toBeVisible();
});

test("dashboard lists the corrupt file under Needs review", async ({ page }) => {
  await page.goto("/dashboard");
  const needs = page.getByRole("region", { name: /Needs review/ });
  await expect(needs).toBeVisible();
  await expect(needs.getByText("scan_0042.pdf", { exact: true })).toBeVisible();
  await expect(needs.getByText(/Could not read PDF/)).toBeVisible();
});

test("layout fits a 400px-wide screen", async ({ page, request }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  for (const path of ["/dashboard", `/jobs/${backend.id}`, `/applicants/${await applicantId(request, backend.id, "Marcus Bell")}`]) {
    await page.goto(path);
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const offenders: string[] = [];
      for (const el of document.querySelectorAll("main *, header *")) {
        if (el.closest("nav")) continue; // the job rail is a horizontal scroller by design
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) offenders.push(`${el.tagName}.${el.className}`);
      }
      return { offenders: offenders.slice(0, 5), docWidth: document.documentElement.scrollWidth, vw };
    });
    expect(overflow.offenders, path).toEqual([]);
    expect(overflow.docWidth, path).toBeLessThanOrEqual(overflow.vw);
  }
});
