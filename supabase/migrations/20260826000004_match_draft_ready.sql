-- Ready check: both sides confirm before the drafter's countdown starts.
-- Writable under the existing match_drafts policies (fixture captains and
-- admins).
alter table public.match_drafts
  add column if not exists blue_ready boolean not null default false,
  add column if not exists red_ready boolean not null default false;
