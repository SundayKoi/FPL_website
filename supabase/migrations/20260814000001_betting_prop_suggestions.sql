-- Member-proposed prop bets ("How much will X go for in the draft?").
-- Members file suggestions; staff approve one into a REAL market through the
-- existing engine: the two sides become synthetic betting_teams rows (flagged
-- is_prop_outcome so the admin catalog can hide them) and create_market_admin
-- does the rest — announcements, odds, cashout, resolve all work unchanged.

-- synthetic outcome rows live in the teams catalog but are not real teams
alter table public.betting_teams
  add column if not exists is_prop_outcome boolean not null default false;

create table public.betting_prop_suggestions (
  id          bigint generated always as identity primary key,
  discord_id  text not null references public.betting_profiles(discord_id),
  question    text not null check (char_length(question) between 5 and 200),
  side_a      text not null check (char_length(side_a) between 1 and 40),
  side_b      text not null check (char_length(side_b) between 1 and 40),
  note        text check (note is null or char_length(note) <= 300),
  status      text not null default 'PENDING'
              check (status in ('PENDING','APPROVED','REJECTED')),
  reason      text,
  market_id   bigint references public.betting_markets(id),
  reviewed_by text,
  created_at  timestamptz not null default now()
);
create index on public.betting_prop_suggestions (status, created_at);
create index on public.betting_prop_suggestions (discord_id, status);

-- server-only table: no client read/write policies (server components use the
-- service client), matching the ledger/audit pattern
alter table public.betting_prop_suggestions enable row level security;
grant all on public.betting_prop_suggestions to service_role;

-- === suggest_prop ============================================================
-- Members file a suggestion; capped at 3 PENDING per wallet so the queue
-- stays reviewable.
create or replace function public.suggest_prop(
  p_user text, p_question text, p_side_a text, p_side_b text, p_note text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if not exists (select 1 from betting_profiles where discord_id = p_user) then
    raise exception 'unknown user %', p_user;
  end if;
  if (select count(*) from betting_prop_suggestions
      where discord_id = p_user and status = 'PENDING') >= 3 then
    raise exception 'you already have 3 pending suggestions — wait for a review';
  end if;
  insert into betting_prop_suggestions(discord_id, question, side_a, side_b, note)
    values (p_user, p_question, p_side_a, p_side_b, p_note)
    returning id into v_id;
  return v_id;
end;
$$;

-- === approve_prop_admin ======================================================
-- Turns a PENDING suggestion into a live market. Creates the two outcome rows
-- and reuses create_market_admin (rake 0, draw off) so announcements and the
-- whole money path are the battle-tested ones.
create or replace function public.approve_prop_admin(
  p_actor text, p_suggestion bigint, p_event bigint, p_game_at timestamptz
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_a bigint;
  v_b bigint;
  v_market bigint;
begin
  select * into s from betting_prop_suggestions where id = p_suggestion for update;
  if not found then raise exception 'unknown suggestion %', p_suggestion; end if;
  if s.status <> 'PENDING' then
    raise exception 'suggestion % is not pending', p_suggestion;
  end if;

  insert into betting_teams(name, short_code, color, is_prop_outcome)
    values (s.side_a, _prop_code(s.side_a, 'A'), '#c9a86a', true)
    returning id into v_a;
  insert into betting_teams(name, short_code, color, is_prop_outcome)
    values (s.side_b, _prop_code(s.side_b, 'B'), '#5a6b7b', true)
    returning id into v_b;

  v_market := create_market_admin(p_actor, p_event, v_a, v_b, s.question,
                                  s.note, p_game_at, 0, null, false);

  update betting_prop_suggestions
     set status = 'APPROVED', market_id = v_market, reviewed_by = p_actor
   where id = p_suggestion;

  perform _audit(p_actor, 'prop_approve', 'betting_prop_suggestions:' || p_suggestion,
                 null, jsonb_build_object('market_id', v_market, 'question', s.question));
  return v_market;
end;
$$;

-- short button label from a side label: "Over 500" -> "OVER500" (max 8),
-- falling back to the given default when nothing alphanumeric survives
create or replace function public._prop_code(p_label text, p_fallback text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(left(regexp_replace(upper(p_label), '[^A-Z0-9]', '', 'g'), 8), ''), p_fallback);
$$;

-- === reject_prop_admin =======================================================
create or replace function public.reject_prop_admin(
  p_actor text, p_suggestion bigint, p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from betting_prop_suggestions where id = p_suggestion for update;
  if not found then raise exception 'unknown suggestion %', p_suggestion; end if;
  if v_status <> 'PENDING' then
    raise exception 'suggestion % is not pending', p_suggestion;
  end if;
  update betting_prop_suggestions
     set status = 'REJECTED', reason = p_reason, reviewed_by = p_actor
   where id = p_suggestion;
  perform _audit(p_actor, 'prop_reject', 'betting_prop_suggestions:' || p_suggestion,
                 null, jsonb_build_object('reason', p_reason));
end;
$$;

-- === lockdown: service_role-only, like the rest of the betting surface ======
revoke execute on function
  public.suggest_prop(text, text, text, text, text),
  public.approve_prop_admin(text, bigint, bigint, timestamptz),
  public.reject_prop_admin(text, bigint, text),
  public._prop_code(text, text)
from public, anon, authenticated;

grant execute on function
  public.suggest_prop(text, text, text, text, text),
  public.approve_prop_admin(text, bigint, bigint, timestamptz),
  public.reject_prop_admin(text, bigint, text),
  public._prop_code(text, text)
to service_role;
