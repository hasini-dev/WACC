# clicked (ResumeDeck)

A recruiter tool styled like a 2016 Tumblr dashboard. Resumes land in a resume database, are parsed and scored against the job they were sent to, and show up as a per-job deck of cards. Swipe right to shortlist, left to pass, undo mistakes, and open any card for the full structured resume.

**Current status: Phase 1.** The whole UI runs on typed mock data in the browser. There is no database, auth or PDF pipeline yet.

## Setup

Requires Node.js 20.9+ (developed on Node 26).

```bash
cd resumedeck
npm install
npx playwright install chromium   # once, for the e2e tests
npm run dev                       # http://localhost:3000 → redirects to /dashboard
```

### Environment variables

Phase 1 needs none. `.env.example` lists the variables later phases will read. Copy it to `.env.local` when you get there. Never commit secrets.

| Variable | Used from | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Phase 2 | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Phase 2 | Workers and server routes only |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Phase 3 | Structured resume extraction |
| `ENCRYPTION_KEY` | Phase 5 | AES-256-GCM for ATS credentials |
| `SHOW_MATCH_SCORES` | Phase 4 | Hide scores until calibration passes |
| `RESUME_POLL_INTERVAL_MS` | Phase 3 | Storage bucket poll interval |
| `GREENHOUSE_WEBHOOK_SECRET`, `LEVER_WEBHOOK_SECRET` | Phase 5 | Webhook signature checks |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | Generates Next route types, then runs `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (next core-web-vitals + typescript) |
| `npm test` | Vitest unit tests (`tests/*.test.ts`) |
| `npm run test:e2e` | Playwright + axe (`tests/e2e`). Builds the app and serves it on port 3100. Runs a desktop project and a 400px-wide phone project |
| `npm run verify` | All of the above |

## Routes

- `/dashboard`: all job decks with counts and the top of each deck, plus a **Needs review** list for files the pipeline couldn't process.
- `/jobs/[jobId]`: the swipe deck for one job, with **To review / Shortlisted / Passed** tabs.
- `/applicants/[applicantId]`: the full resume page. The same `ResumeDetail` component also opens as a modal on the deck page.

## How Phase 1 works

- **Mock data** (`src/lib/mock-data.ts`): 3 jobs and 14 fictional applicants. Scores are **computed, not typed in**: `scoreResume` (`src/lib/match-scoring.ts`, formula v1 `round(must*40 + experience*25 + domain*20 + nice*15)`) runs over each structured resume. That keeps reasons, breakdown bars and evidence quotes consistent. The scorer's input type has no name, contact or education fields, so those can't affect a score.
- **State** (`src/lib/deck-reducer.ts`, a pure reducer, and `src/lib/deck-store.tsx`, the React provider): reviews are an append-only log, the same model as the Phase 2 `reviews` table. An application's status is its latest review where `undoneAt` is null. Undo sets `undoneAt` and puts the card back on top. "Move back to deck" is a `reset` review, so it can be undone too.
- **Deck ordering:** score descending, then applied date. New arrivals and moved-back cards are inserted by rank **from position 2 down**, so the card on top is never replaced.
- **Simulated resume database:** 4 more files are queued (one is a scanned resume that logs `OCR used on page 1`, and one is a corrupt PDF that goes to **Needs review**). One is pulled 6s after load and then every 12s. **Pause sync** and **Pull next file now** control this. The job's pill pulses green when a new applicant arrives.
- **State lives in memory** and resets on reload. Persistence is Phase 2.

### Interactions

- Drag a card with mouse or touch (pointer events). It rotates slightly, and the SHORTLIST / PASS stamps fade in with distance. Past 110px it flies off. A click without movement opens the detail view.
- Keyboard: `←` pass, `→` shortlist, `Z` or `Backspace` undo, `Enter` open, `Esc` close. Shortcuts are ignored while typing or while the modal is open.
- Every swipe has a button equivalent: the big round buttons, the card footer icons, and the modal's Pass / Shortlist buttons.
- After each decision a toast with **Undo** appears, and an `aria-live` region announces decisions and new arrivals.
- The detail modal is a native `<dialog>` (`showModal()`): focus is trapped and returns to the opener on close.
- `prefers-reduced-motion` disables the fly-off and enter animations.

### Accessibility notes

The spec's palette is used for fills. Two values fail WCAG AA as small text on white: `--ink-soft` (3.7:1) and white on `--green` (2.3:1). So `tokens.css` adds `--ink-muted` and darker `--*-ink` variants for text, and `--on-fill` (dark navy) for text on colored fills. axe reports zero serious or critical violations on the dashboard, deck, detail page and open modal.

## Verify Phase 1

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

Manual check (`npm run dev`):
1. Open `/jobs/job-backend-java`. Drag Marcus Bell right: the card flies off, the toast says "Shortlisted Marcus Bell", and Priya Raman is on top.
2. Press `Z`: Marcus Bell is back on top. Press `→`, open the **Shortlisted** tab, click **Move back to deck**, then press `Z`.
3. Click the card (no drag) or press `Enter`: the modal opens with the match breakdown and resume sections. `Esc` closes it.
4. Click **Pull next file now** twice: Aisha Karim joins the deck at position 2 (with an OCR log line), then `scan_0042.pdf` errors and appears under **Needs review** on `/dashboard`.
5. Narrow the window to 400px: the job rail becomes a horizontal scroller and the deck stacks.

## Folder notes

The layout follows the project spec. Files added beyond the listed ones: `src/lib/{mock-data,deck-reducer,deck-store,brand}.ts(x)`, `src/styles/tokens.css`, extra presentational components in `src/components/`, and `scripts/screenshots.mjs` (dev helper: `node scripts/screenshots.mjs <out-dir>` against a running server on :3100). The empty `src/app/api/*`, `src/workers`, `src/integrations` and `supabase/migrations` folders are filled in Phases 2–5.
