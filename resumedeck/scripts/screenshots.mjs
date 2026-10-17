// Dev helper: capture screenshots of each view from a running server.
// Usage: node scripts/screenshots.mjs <out-dir> [baseUrl]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? ".";
const base = process.argv[3] ?? "http://localhost:3100";
const views = [
  ["deck-desktop", 1280, 1000, "/jobs/job-backend-java"],
  ["dash-desktop", 1280, 1000, "/dashboard"],
  ["deck-phone", 400, 900, "/jobs/job-backend-java"],
  ["applicant", 1280, 1000, "/applicants/apl-marcus-bell"],
];

const browser = await chromium.launch();
const problems = [];
for (const [name, width, height, path] of views) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${name}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`${name} pageerror: ${e.message}`));
  await page.goto(base + path);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: name !== "deck-phone" });
  if (name === "deck-desktop") {
    const box = await page.getByTestId("resume-card").boundingBox();
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 290, box.y + 210, { steps: 5 });
    await page.screenshot({ path: `${out}/drag.png` });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/modal.png` });
  }
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollWidth > width) problems.push(`${name}: horizontal overflow ${scrollWidth} > ${width}`);
  await page.close();
}
console.log(problems.join("\n") || "no console errors, no overflow");
await browser.close();
