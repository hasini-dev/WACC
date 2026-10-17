import { expect, test, type Page } from "@playwright/test";

const DECK = "/jobs/job-backend-java";

const topCardName = (page: Page) => page.getByTestId("resume-card").getByRole("heading", { level: 2 });

async function dragTopCard(page: Page, dx: number) {
  const card = page.getByTestId("resume-card");
  const box = await card.boundingBox();
  if (!box) throw new Error("no card");
  // Grab the card body, away from the name button and footer buttons.
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + 4, { steps: 6 });
  await page.mouse.move(x + dx, y + 8, { steps: 6 });
  await page.mouse.up();
}

test("all three routes render", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your decks" })).toBeVisible();

  await page.goto(DECK);
  await expect(page.getByRole("heading", { level: 1, name: "Senior Backend Engineer (Java)" })).toBeVisible();
  await expect(topCardName(page)).toHaveText("Marcus Bell");

  await page.goto("/applicants/apl-mei-chen");
  await expect(page.getByRole("heading", { name: "Mei Chen", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Match breakdown" })).toBeVisible();
});

test("swipe right → undo → card returns", async ({ page }) => {
  await page.goto(DECK);
  await expect(topCardName(page)).toHaveText("Marcus Bell");

  await dragTopCard(page, 260);

  await expect(topCardName(page)).toHaveText("Priya Raman");
  await expect(page.getByTestId("toast")).toContainText("Shortlisted Marcus Bell");
  await expect(page.getByRole("tab", { name: /Shortlisted/ })).toContainText("1");

  await page.getByRole("group", { name: "Decision" }).getByRole("button", { name: "Undo last decision" }).click();

  await expect(topCardName(page)).toHaveText("Marcus Bell");
  await expect(page.getByRole("tab", { name: /Shortlisted/ })).toContainText("0");
});

test("a short drag springs back without deciding", async ({ page }) => {
  await page.goto(DECK);
  await page.getByRole("button", { name: "Pause sync" }).click();
  await dragTopCard(page, 60);
  await expect(topCardName(page)).toHaveText("Marcus Bell");
  await expect(page.getByRole("tab", { name: /To review/ })).toContainText("5");
});

test("keyboard: → shortlists, ← passes, Z undoes", async ({ page }) => {
  await page.goto(DECK);
  await expect(topCardName(page)).toHaveText("Marcus Bell");
  await page.locator("body").click({ position: { x: 5, y: 300 } });

  await page.keyboard.press("ArrowRight");
  await expect(topCardName(page)).toHaveText("Priya Raman");
  await page.keyboard.press("ArrowLeft");
  await expect(topCardName(page)).not.toHaveText("Priya Raman");

  await page.keyboard.press("z");
  await expect(topCardName(page)).toHaveText("Priya Raman");
  await page.keyboard.press("Backspace");
  await expect(topCardName(page)).toHaveText("Marcus Bell");
});

test("toast undo restores the card", async ({ page }) => {
  await page.goto(DECK);
  await page.getByRole("group", { name: "Decision" }).getByRole("button", { name: "Pass on Marcus Bell" }).click();
  await expect(topCardName(page)).toHaveText("Priya Raman");
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(topCardName(page)).toHaveText("Marcus Bell");
});

test("clicking a card opens the detail modal; Esc closes it", async ({ page }) => {
  await page.goto(DECK);
  const card = page.getByTestId("resume-card");
  const box = (await card.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);

  const dialog = page.getByRole("dialog", { name: "Marcus Bell" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Match breakdown" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Experience" })).toBeVisible();

  // Arrow keys must not decide while the modal is open.
  await page.keyboard.press("ArrowRight");
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(topCardName(page)).toHaveText("Marcus Bell");
});

test("Enter opens the top card and the modal can shortlist", async ({ page }) => {
  await page.goto(DECK);
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Marcus Bell" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Shortlist" }).click();
  await expect(dialog).toBeHidden();
  await expect(topCardName(page)).toHaveText("Priya Raman");
});

test("tabs list decisions and 'Move back to deck' is undoable", async ({ page }) => {
  await page.goto(DECK);
  await page.getByRole("group", { name: "Decision" }).getByRole("button", { name: "Shortlist Marcus Bell" }).click();
  await expect(topCardName(page)).toHaveText("Priya Raman");

  await page.getByRole("tab", { name: /Shortlisted/ }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("button", { name: "Marcus Bell" })).toBeVisible();

  await panel.getByRole("button", { name: "Move back to deck" }).click();
  await expect(panel.getByText(/No one shortlisted yet/)).toBeVisible();

  await page.getByRole("tab", { name: /To review/ }).click();
  // Moved-back cards never jump in front of the card on top.
  await expect(topCardName(page)).toHaveText("Priya Raman");

  await page.keyboard.press("z");
  await page.getByRole("tab", { name: /Shortlisted/ }).click();
  await expect(page.getByRole("tabpanel").getByRole("button", { name: "Marcus Bell" })).toBeVisible();
});

test("deck cleared empty state", async ({ page }) => {
  await page.goto("/jobs/job-ux-designer");
  await page.getByRole("button", { name: "Pause sync" }).click();
  const pass = page.getByRole("group", { name: "Decision" }).getByRole("button", { name: /^Pass/ });
  for (let i = 0; i < 3; i++) {
    await expect(pass).toBeEnabled();
    await pass.click();
  }
  await expect(page.getByText("Deck cleared")).toBeVisible();
  await expect(page.getByText("New applicants for this role will appear here as they arrive.")).toBeVisible();
});

test("pulling a file inserts the new applicant below the top card and logs it", async ({ page }) => {
  await page.goto(DECK);
  await page.getByRole("button", { name: "Pause sync" }).click();
  await page.getByRole("button", { name: "Pull next file now" }).click();
  const log = page.getByRole("list", { name: "Pipeline activity log" });
  await expect(log).toContainText("OCR used on page 1");
  await expect(log).toContainText("OK Aisha Karim");
  await expect(topCardName(page)).toHaveText("Marcus Bell");
  await expect(page.getByRole("tab", { name: /To review/ })).toContainText("6");

  // The next file is corrupt and must show up under "Needs review".
  await page.getByRole("button", { name: "Pull next file now" }).click();
  await expect(log).toContainText("ERR scan_0042.pdf");
  await page.getByRole("link", { name: "clicked dashboard" }).click();
  await expect(page.getByRole("heading", { name: /Needs review/ })).toBeVisible();
  await expect(page.getByText("scan_0042.pdf", { exact: true })).toBeVisible();
});

test("layout fits a 400px-wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  for (const path of ["/dashboard", DECK, "/applicants/apl-marcus-bell"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const offenders: string[] = [];
      for (const el of document.querySelectorAll("main *, header *")) {
        // Elements inside a horizontal scroller (the job rail) are allowed to extend.
        if (el.closest("nav")) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) offenders.push(`${el.tagName}.${el.className}`);
      }
      return offenders.slice(0, 5);
    });
    expect(overflow, path).toEqual([]);
  }
});
