-- Phase 2: core schema, review log, queue, audit log, and row-level security.
-- Idempotent where practical so it can be pasted into the Supabase SQL Editor.

-- ─── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type public.org_role as enum ('admin', 'recruiter', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.resume_status as enum ('pending', 'extracting', 'extracted', 'needs_review', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.review_decision as enum ('shortlist', 'pass', 'reset');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.processing_status as enum ('queued', 'running', 'done', 'failed', 'dead');
exception when duplicate_object then null; end $$;

-- ─── Organizations ──────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'recruiter',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members (user_id);

-- Membership helpers. SECURITY DEFINER so policies on org_members don't recurse.
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = (select auth.uid()));
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

create or replace function public.can_review(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role in ('admin', 'recruiter')
  );
$$;

-- ─── Jobs ───────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  location text not null default '',
  min_years numeric(4, 1) not null default 0,
  -- { must_have: [{skill, aliases[], weight}], nice_to_have: [...], domains: [...] } — validated with Zod
  requirements jsonb not null default '{"must_have": [], "nice_to_have": [], "domains": []}',
  status text not null default 'open' check (status in ('open', 'paused', 'closed')),
  -- Folder in the resume bucket whose PDFs belong to this job, e.g. "backend-engineer".
  storage_prefix text,
  external_id text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, storage_prefix),
  unique (org_id, source, external_id)
);
create index if not exists jobs_org_idx on public.jobs (org_id);

-- ─── Applicants, resumes, applications ──────────────────────────────────────
create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  location text,
  current_title text,
  external_id text,
  source text not null default 'resume_db',
  created_at timestamptz not null default now(),
  unique (org_id, source, external_id)
);
create index if not exists applicants_org_idx on public.applicants (org_id);
create index if not exists applicants_email_idx on public.applicants (org_id, lower(email));

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  applicant_id uuid references public.applicants (id) on delete cascade,
  storage_path text not null,
  sha256 text not null,
  mime_type text not null default 'application/pdf',
  byte_size integer not null,
  status public.resume_status not null default 'pending',
  extraction_method text check (extraction_method in ('text', 'ocr', 'mixed')),
  page_count integer,
  char_count integer,
  ocr_confidence numeric(5, 2),
  raw_text text,
  sections jsonb,
  structured jsonb,
  error_code text,
  error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sha256)
);
create index if not exists resumes_org_status_idx on public.resumes (org_id, status);
create index if not exists resumes_path_idx on public.resumes (org_id, storage_path);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  resume_id uuid references public.resumes (id) on delete set null,
  applied_at timestamptz not null default now(),
  external_id text,
  created_at timestamptz not null default now(),
  unique (job_id, applicant_id)
);
create index if not exists applications_job_idx on public.applications (job_id, applied_at);

-- History is kept: the newest row per application is current.
create table if not exists public.match_scores (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  score integer not null check (score between 0 and 100),
  breakdown jsonb not null,
  evidence jsonb not null default '[]',
  reasons jsonb not null default '[]',
  scoring_version text not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists match_scores_app_idx on public.match_scores (application_id, created_at desc);

create or replace view public.current_match_scores with (security_invoker = true) as
  select distinct on (application_id) *
  from public.match_scores
  order by application_id, created_at desc, id desc;

-- ─── Reviews (append-only) ──────────────────────────────────────────────────
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id),
  decision public.review_decision not null,
  reason text,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists reviews_app_idx on public.reviews (application_id, created_at desc);
create index if not exists reviews_reviewer_idx on public.reviews (reviewer_id, created_at desc) where undone_at is null;

-- Only `undone_at` may change, only once, and never back to null.
create or replace function public.reviews_guard_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.org_id <> old.org_id or new.application_id <> old.application_id
     or new.reviewer_id <> old.reviewer_id or new.decision <> old.decision
     or new.created_at <> old.created_at or new.reason is distinct from old.reason then
    raise exception 'reviews are append-only; only undone_at may be set';
  end if;
  if old.undone_at is not null then
    raise exception 'review already undone';
  end if;
  return new;
end $$;

drop trigger if exists reviews_guard_update on public.reviews;
create trigger reviews_guard_update before update on public.reviews
  for each row execute function public.reviews_guard_update();

-- Status = latest review with undone_at is null; 'to_review' when there is none.
create or replace view public.application_status with (security_invoker = true) as
  select
    a.id as application_id,
    a.org_id,
    a.job_id,
    coalesce(
      case r.decision when 'shortlist' then 'shortlist' when 'pass' then 'pass' else 'to_review' end,
      'to_review'
    ) as status,
    r.id as review_id,
    r.created_at as decided_at
  from public.applications a
  left join lateral (
    select rv.id, rv.decision, rv.created_at
    from public.reviews rv
    where rv.application_id = a.id and rv.undone_at is null
    order by rv.created_at desc, rv.id desc
    limit 1
  ) r on true;

-- ─── Queue ──────────────────────────────────────────────────────────────────
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}',
  status public.processing_status not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists processing_jobs_ready_idx on public.processing_jobs (run_after) where status = 'queued';

-- Claim up to p_limit ready jobs; concurrent workers never get the same row.
-- Rows locked for longer than p_lock_timeout are considered abandoned and reclaimed.
create or replace function public.claim_processing_jobs(
  p_worker text,
  p_kinds text[] default null,
  p_limit integer default 1,
  p_lock_timeout interval default interval '5 minutes'
) returns setof public.processing_jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with ready as (
    select j.id
    from public.processing_jobs j
    where (
        (j.status = 'queued' and j.run_after <= now())
        or (j.status = 'running' and j.locked_at < now() - p_lock_timeout)
      )
      and (p_kinds is null or j.kind = any (p_kinds))
    order by j.run_after
    limit p_limit
    for update skip locked
  )
  update public.processing_jobs j
     set status = 'running', locked_at = now(), locked_by = p_worker,
         attempts = j.attempts + 1, updated_at = now()
    from ready
   where j.id = ready.id
  returning j.*;
end $$;

revoke all on function public.claim_processing_jobs(text, text[], integer, interval) from public, anon, authenticated;

-- ─── Audit log ──────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_org_idx on public.audit_log (org_id, created_at desc);

-- Record every review insert and undo.
create or replace function public.audit_reviews()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, meta)
  values (
    new.org_id,
    coalesce((select auth.uid()), new.reviewer_id),
    case when tg_op = 'INSERT' then 'review.' || new.decision::text else 'review.undo' end,
    'review',
    new.id::text,
    jsonb_build_object('application_id', new.application_id)
  );
  return new;
end $$;

drop trigger if exists audit_reviews on public.reviews;
create trigger audit_reviews after insert or update of undone_at on public.reviews
  for each row execute function public.audit_reviews();

-- ─── Row-level security ─────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.jobs enable row level security;
alter table public.applicants enable row level security;
alter table public.resumes enable row level security;
alter table public.applications enable row level security;
alter table public.match_scores enable row level security;
alter table public.reviews enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.audit_log enable row level security;

-- organizations: members read; admins update. Creation happens server-side.
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select to authenticated using (public.is_org_member(id));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- org_members: members see their org's roster; admins manage it.
drop policy if exists members_select on public.org_members;
create policy members_select on public.org_members for select to authenticated using (public.is_org_member(org_id));
drop policy if exists members_admin_write on public.org_members;
create policy members_admin_write on public.org_members for all to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- jobs: members read; only admins create/update/delete.
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs for select to authenticated using (public.is_org_member(org_id));
drop policy if exists jobs_admin_write on public.jobs;
create policy jobs_admin_write on public.jobs for all to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- applicants / resumes / applications: members read. Writes come from workers (service role).
drop policy if exists applicants_select on public.applicants;
create policy applicants_select on public.applicants for select to authenticated using (public.is_org_member(org_id));
drop policy if exists resumes_select on public.resumes;
create policy resumes_select on public.resumes for select to authenticated using (public.is_org_member(org_id));
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications for select to authenticated using (public.is_org_member(org_id));

-- match_scores: readable through the application's org.
drop policy if exists match_scores_select on public.match_scores;
create policy match_scores_select on public.match_scores for select to authenticated using (
  exists (select 1 from public.applications a where a.id = application_id and public.is_org_member(a.org_id))
);

-- reviews: members read; admins/recruiters insert as themselves for an application in their org;
-- the reviewer (or an admin) may set undone_at. No deletes.
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select to authenticated using (public.is_org_member(org_id));
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert to authenticated with check (
  reviewer_id = (select auth.uid())
  and undone_at is null
  and public.can_review(org_id)
  and exists (select 1 from public.applications a where a.id = application_id and a.org_id = reviews.org_id)
);
drop policy if exists reviews_undo on public.reviews;
create policy reviews_undo on public.reviews for update to authenticated
  using (reviewer_id = (select auth.uid()) or public.is_org_admin(org_id))
  with check (reviewer_id = (select auth.uid()) or public.is_org_admin(org_id));

-- audit_log: admins read. Inserts only via triggers / service role.
drop policy if exists audit_admin_select on public.audit_log;
create policy audit_admin_select on public.audit_log for select to authenticated using (public.is_org_admin(org_id));

-- processing_jobs: no policies → only the service role (workers) can touch it.
