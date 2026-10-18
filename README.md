# clicked (ResumeDeck)

A recruiter tool styled like a 2016 Tumblr dashboard. Resume PDFs land in a resume database (a Supabase Storage bucket with one folder per job). A worker extracts the text (with OCR for scans), structures it with an open model, and scores each resume against its job's requirements. Recruiters work through a per-job deck: swipe right to shortlist, left to pass, undo, and open any card for the full resume.

**Status: prototype, Phases 1–3 plus most of the Phase 4 scoring engine.** See [What's real vs. stubbed](#whats-real-vs-stubbed).

## Quick start

Requires Node.js 22+ (developed on Node 26; uses the built-in `node:sqlite`).

```bash
cd resumedeck
npm install
cp .env.example .env.local      # then fill it in (see below)
npm run demo                    # web app on http://localhost:3000 + background worker
```

Sign in at `/login` with the `SEED_RECRUITER_EMAIL` address. You'll get a magic-link email from Supabase, and the first sign-in makes that address the org admin.

**Offline demo, no bucket or model needed:** set `RESUME_SOURCE=local:tests/fixtures/bucket` and `LLM_PROVIDER=none` in `.env.local`, then `npm run demo`. The fixtures produce 15 scored applicants across 3 decks, plus 1 corrupt file under Needs review.

## Configuration (`.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project. Used for magic-link auth and to download files from the public bucket. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (`sb_secret_…`), used by the worker only. Needed to **list** the bucket (or see the storage policy below). Never exposed to the browser. |
| `RESUME_BUCKET` | Bucket name (default `resumes`). **The first folder of each file's path is its job**, e.g. `backend-engineer/jane.pdf`. |
| `RESUME_SOURCE` | `local:<dir>` reads a local folder instead of the bucket. |
| `SEED_RECRUITER_EMAIL` | Created as the org's admin on first run. |
| `LLM_PROVIDER`, `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_API_KEY` | Structured extraction. `ollama` with `https://ollama.com` and `gemma4:31b` uses Ollama cloud (free tier); `http://localhost:11434` and `gemma4:12b` uses a local model; `none` uses heuristics only. |
| `RESUME_POLL_INTERVAL_MS` | How often the worker checks the bucket (default 10 s). |
| `DATA_DIR` | Where the SQLite file lives (default `./.data`). |

### Letting the worker list the bucket

Supabase Storage hides objects from the publishable key unless a policy allows it. Without one, listing returns nothing, and the Resume database panel says so. Pick one:

1. **Recommended:** put the project's secret key in `SUPABASE_SERVICE_ROLE_KEY`.
2. **Prototype shortcut:** run this in the Supabase SQL Editor. It makes file *names* in the bucket listable by anyone holding the publishable key. The bucket is already public, so the files themselves are already readable by anyone who knows a URL.
   ```sql
   create policy "prototype: list resumes" on storage.objects
     for select to anon using (bucket_id = 'resumes');
   ```

### Magic links

In Supabase → Authentication → URL Configuration, add `http://localhost:3000/auth/callback` to Redirect URLs. If you skip that, links land on the Site URL and the app forwards them to the callback anyway.

## How it works

```
bucket/<job-folder>/<file>.pdf
  └─ ingest-resume   list → skip known paths → download → %PDF magic-byte + 10 MB check → SHA-256 dedupe
       └─ queue: process_resume (SQLite, claim/complete/backoff → dead)
            └─ process-resume
                 pdf-parser        text layer per page; pages with < 40 chars → rasterize + tesseract OCR; normalize
                 resume-extractor  heading split → Ollama JSON (Zod-validated, 1 retry) → drop skills whose quote isn't in the text
                 needs review?     OCR < 70, < 2 sections, no dates, < 300 chars, model output invalid → kept out of decks
                 match-scoring     v1: round(must*40 + experience*25 + domain*20 + nice*15), evidence only
```

- **Jobs come from folders.** A folder named like one of the spec's three roles (backend / data analyst / UX) gets that role's requirements. Any other folder gets requirements drafted by the model, editable in the database.
- **Storage:** a local SQLite file (`src/lib/db.ts`) shared by the web app and the worker. Its tables mirror `supabase/migrations/20261017000001_core_schema.sql`, the Postgres schema with RLS for moving to Supabase Postgres. Every query in `src/lib/repo.ts` is scoped to the caller's org, standing in for RLS. Reviews are append-only, enforced by triggers, and status is the latest review that hasn't been undone.
- **API** (Zod-validated, org-scoped): `GET /api/jobs`, `GET /api/jobs/[jobId]/deck?status=to_review|shortlist|pass|all`, `GET /api/applicants/[id]`, `POST /api/reviews`, `POST /api/reviews/[id]/undo` (reviewer or admin only), `GET /api/reviews/undo-stack?jobId=`, `GET|POST /api/pipeline`.
- **UI:** the client polls every 5 s and applies optimistic updates, rolling back on error. The card on top is never replaced by a refresh, new arrivals go in by score from position 2 down, and an undone card returns to the top. The undo stack comes from the server, so it survives a reload.
- **Model safety:** resume text is sent inside `<resume>` tags as data, never as instructions. The model only extracts; it never produces a score. Name, contact details, school and graduation year are never passed to the scorer.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run demo` | Web app (dev) and worker together |
| `npm run dev` / `npm run worker` | Run them separately |
| `npm run worker:once` | One sync and drain, then exit |
| `npm run fixtures` | Regenerate `tests/fixtures/bucket` (14 resumes, 2 scanned, 1 two-column, 1 corrupt, 1 duplicate) |
| `npm run bucket:inspect` | List the real bucket's folders and file counts |
| `npm run typecheck` / `npm run lint` / `npm test` / `npm run test:e2e` | Checks. e2e builds the app, runs the real pipeline on the fixtures with the model off, then drives the UI |
| `npm run db:migrate` | Apply the Postgres schema to Supabase (needs `DATABASE_URL`) |

## Verify

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

- **Unit/integration (42):** the scoring formula, aliases, date merging, determinism, identity fields never reaching the scorer; the deck reducer (top card pinned, undo to top, move back); the PDF pipeline (magic bytes, 10 MB limit, normalization, text layer, OCR on scans, corrupt file, two-column layout, hallucinated-skill removal, prompt injection, full ingest with dedupe); org isolation (org B can't read or review org A, viewers can't review, only the reviewer or an admin can undo, reviews are append-only, rescoring adds a new row).
- **E2E (28, desktop + 400 px):** routes render from pipeline data; swipe → undo; short drag springs back; decisions persist across a reload and in a second browser; the undo stack survives a reload; keyboard; toast undo; modal with extracted text; tabs and an undoable move back; empty deck; Needs review; 400 px layout; axe finds no serious violations.

## What's real vs. stubbed

| Area | State |
| --- | --- |
| UI (Phase 1) | Done |
| Persistence, API, auth (Phase 2) | Works on **local SQLite** instead of Supabase Postgres (no database credentials were available). The Postgres migration with RLS is written but not applied. Magic-link auth uses Supabase Auth. |
| PDF pipeline (Phase 3) | Done, using Ollama in place of Anthropic. The worker polls; there's no `POST /api/resumes` manual upload yet. |
| Matching (Phase 4) | Scoring engine, evidence links and determinism/fairness tests are done. **Not done:** the labeled calibration set, the `SHOW_MATCH_SCORES` gate, `npm run calibrate`. |
| ATS integrations, production hardening (Phases 5–6) | Not started |

## Responsible use

The score ranks; it never decides. Every card is decided by a person, there are no automatic rejections, and a low score only sorts a card lower. Scores are computed from quoted resume evidence against a job's written requirements. Names, contact details, schools and graduation years are excluded from scoring. Scores are uncalibrated until Phase 4's labeled set exists, so treat them as a reading order, not a judgment.
