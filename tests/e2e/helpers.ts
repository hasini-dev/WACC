import { expect, type APIRequestContext, type Page } from "@playwright/test";

export interface JobRef {
  id: string;
  title: string;
}

export async function resetDb(request: APIRequestContext) {
  const res = await request.post("/api/test/reset");
  expect(res.ok()).toBe(true);
}

export async function jobByTitle(request: APIRequestContext, re: RegExp): Promise<JobRef> {
  const { jobs } = (await (await request.get("/api/jobs")).json()) as { jobs: JobRef[] };
  const job = jobs.find((j) => re.test(j.title));
  if (!job) throw new Error(`no job matching ${re}`);
  return job;
}

export async function applicantId(request: APIRequestContext, jobId: string, name: string): Promise<string> {
  const { cards } = (await (await request.get(`/api/jobs/${jobId}/deck?status=all`)).json()) as {
    cards: Array<{ applicant: { id: string; fullName: string } }>;
  };
  const card = cards.find((c) => c.applicant.fullName === name);
  if (!card) throw new Error(`no applicant ${name}`);
  return card.applicant.id;
}

export const topCardName = (page: Page) => page.getByTestId("resume-card").getByRole("heading", { level: 2 });

export async function openDeck(page: Page, job: JobRef) {
  await page.goto(`/jobs/${job.id}`);
  await expect(page.getByTestId("resume-card")).toBeVisible();
}

export async function dragTopCard(page: Page, dx: number) {
  const box = await page.getByTestId("resume-card").boundingBox();
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

/** Click empty page background so keyboard shortcuts aren't swallowed by a focused control. */
export async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}
