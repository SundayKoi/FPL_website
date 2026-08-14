-- Nemesis draft: after the auction completes, each team just placed banishes
-- another to the opposite division. This table is the whole state machine --
-- phase, whose turn it is, and the next division are all derived from it, so
-- an undo is a plain delete with no turn pointer left to correct.
--
-- pick_number 0 is the admin's seed: a team and the side it starts on, with no
-- chooser. Every later pick records who sent whom where.

create table public.nemesis_picks (
  id              uuid primary key default gen_random_uuid(),
  draft_id        uuid not null references public.drafts(id) on delete cascade,
  pick_number     int  not null,
  chooser_team_id uuid references public.teams(id) on delete cascade,
  chosen_team_id  uuid not null references public.teams(id) on delete cascade,
  division        text not null check (division in ('Lunari', 'Solari')),
  created_at      timestamptz not null default now(),
  unique (draft_id, pick_number),
  unique (draft_id, chosen_team_id),
  check ((pick_number = 0) = (chooser_team_id is null))
);

alter table public.nemesis_picks enable row level security;

-- Spectators watch the chain unfold; all writes go through the RPCs.
create policy nemesis_picks_public_read on public.nemesis_picks for select using (true);

grant select on public.nemesis_picks to anon, authenticated;
grant all on public.nemesis_picks to service_role;

-- Realtime evaluates a DELETE subscription filter against old_record, which
-- under the default replica identity (primary key only) carries just `id` --
-- `draft_id` would be absent and the filter would never match, so undo/reset
-- deletes would never stream. Carry every column on delete so the filter sees it.
alter table public.nemesis_picks replica identity full;

alter publication supabase_realtime add table public.nemesis_picks;
