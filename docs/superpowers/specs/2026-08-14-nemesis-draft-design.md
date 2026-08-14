# Nemesis Draft Design

## Goal

After the auction draft completes, captains take turns banishing another team to the
opposite division until every team is placed in Lunari or Solari. An admin decides
which team starts and which division it starts in; from there the chain is forced.

The same work closes a gap in the auction draft: a forced auto-assignment (the last
player in a role handed to the only team needing it) is currently permanent and
cannot be undone.

## Approved Design

### The chain

- An admin seeds the draft by choosing one team and its division. That is pick 0.
- The team just placed is on the clock and chooses any unplaced team.
- The chosen team is placed in the division opposite its chooser's, then chooses next.
- Sides therefore alternate on every pick, so a 12-team league lands 6-6 with no cap
  logic. With N teams the draft is pick 0 plus N-1 picks, N rows in total.
- A team can never pick itself: the chooser was placed by an earlier pick, and a team
  may only be placed once.
- The draft is complete when every team in the draft has been placed.

### Who may act

- The captain of the team on the clock may pick.
- An admin may pick on behalf of the team on the clock, without changing whose turn it
  was.
- Admins may undo the last pick, or reset the whole nemesis draft.
- Everyone, signed in or not, may watch.

### There is no clock

Picks are untimed. A stalling team is handled by an admin picking for them.

## Architecture

### Data model

`nemesis_picks` is the sole source of truth for the chain.

```sql
create table public.nemesis_picks (
  id              uuid primary key default gen_random_uuid(),
  draft_id        uuid not null references public.drafts(id) on delete cascade,
  pick_number     int  not null,                    -- 0 = the admin's seed
  chooser_team_id uuid references public.teams(id) on delete cascade,
  chosen_team_id  uuid not null references public.teams(id) on delete cascade,
  division        text not null check (division in ('Lunari','Solari')),
  created_at      timestamptz not null default now(),
  unique (draft_id, pick_number),
  unique (draft_id, chosen_team_id),
  check ((pick_number = 0) = (chooser_team_id is null))
);
```

State is derived, never stored:

| Question | Answer |
| --- | --- |
| Has it started? | any rows for this draft |
| Who is on the clock? | `chosen_team_id` of the highest `pick_number` |
| Which division does their pick go to? | the opposite of that row's `division` |
| Is it complete? | row count equals the draft's team count |

No turn pointer exists, so undo cannot leave one stale — deleting the last row rewinds
the clock by definition. The two unique constraints are the concurrency backstop: two
simultaneous picks cannot both place a team or both claim a pick number, regardless of
what the RPC checks.

`teams.division` remains the denormalized result because team pages, standings, and the
schedule already read it. It is a projection written in the same transaction as the
pick and rewritten by undo and reset. It is never consulted to decide whose turn it is,
and the next division is read from the last pick's `division` column rather than from
`teams`, keeping the chain self-contained.

RLS: public read, no client writes. All mutation goes through the RPCs below, matching
`draft_chat` and the auction tables. The table joins the `supabase_realtime`
publication so the board streams picks.

### RPCs

All are `security definer`, lock the draft row `for update` before reading state, and
raise `CODE: message` errors in the established style.

`nemesis_start(p_draft_id uuid, p_team_id uuid, p_division text)` — admin only.
Requires the auction draft to be `complete`, the draft to hold at least two teams, no
existing picks, a team belonging to the draft, and a division of `Lunari` or `Solari`.
Clears every division on the draft's teams so leftovers from manual editing cannot
survive, writes pick 0, sets that team's division, and posts a chat line naming who
starts and where.

`nemesis_pick(p_draft_id uuid, p_chosen_team_id uuid)` — the caller must be the captain
of the team on the clock, or an admin. Requires the draft to have started and not be
complete, and the chosen team to belong to the draft and be unplaced. Writes the next
pick with the division opposite the previous row's, updates `teams.division`, and posts
`"Team A sent Team B to Solari"`. On the final pick it also posts the completed
two-division result.

`nemesis_undo(p_draft_id uuid)` — admin only. Deletes the highest pick and nulls that
team's division. Refuses to undo pick 0; unwinding the seed is what reset is for.

`nemesis_reset(p_draft_id uuid)` — admin only. Deletes all picks for the draft and
nulls all its divisions.

Grants follow the existing pattern: `revoke all ... from public`, then
`grant execute ... to authenticated, service_role`.

### Interaction with auction undo

`undo_last_sale` can push a completed auction back to `live`. If that happens after the
nemesis draft has started, nothing breaks: divisions do not depend on rosters, so the
chain continues. Only `nemesis_start` checks for completeness.

### UI

`/draft/[id]` shows final rosters once the auction completes; the nemesis board sits
above them.

`src/lib/draft/nemesis.ts` is a pure derivation over teams and picks, returning
`{ phase, onTheClockTeamId, nextDivision, placed, unplaced, byDivision }`. Every rule is
unit-testable without a database, as with `derive.ts`, and the components stay dumb.

Four states:

- **Not started** — admins see a seed panel (first team, division, Start). Everyone else
  sees that the nemesis draft has not started.
- **Live** — two division columns side by side, unplaced teams below, and a banner
  naming who is on the clock and which side their pick is banished to.
- **Your turn** — for the captain on the clock, unplaced teams become `Send to Solari`
  buttons. Admins see the same buttons plus undo and reset.
- **Complete** — the final Lunari vs Solari lineup with the pick order beneath it.

Live updates come from a small `useNemesisPicks(draftId)` hook with its own realtime
subscription rather than growing `useDraftState`, which already carries five tables and
is the largest file in `src/hooks`. Division changes on `teams` already stream through
the existing subscription.

New files: `NemesisBoard.tsx`, a seed panel component, `useNemesisPicks.ts`, and
`nemesis.ts`.

### Undoable forced auto-assignments

`players` gains `auto_assigned_from_lot_id uuid references public.lots(id)`, stamped by
`_auto_assign_forced` with the lot whose closure triggered the cascade.
`_auto_assign_forced` is only ever called from `_close_lot`, immediately after the sale,
so the triggering lot is always known and the function takes it as a parameter. Adding
that parameter creates a second signature rather than replacing the old one, so the
migration must `drop function public._auto_assign_forced(uuid)` and leave only the
two-argument form callable — an orphaned overload would silently keep stamping nothing.

`undo_last_sale` reverses the sale as it does today and, in the same transaction,
refunds 1 point per attached auto-assigned player, returns each to the pool, and clears
the stamp. One cascade can place several players; they share a lot id and all return
together. A chat line records the reversal, mirroring the line that announced it.

The undo button is unchanged, but its confirmation names what will be reversed — for
example *"Undo the sale of Mid One and also return Jungle Two, auto-assigned as a
result?"* — because silently reversing four players when the admin clicked undo on one
sale would be a surprise. This requires `auto_assigned_from_lot_id` on the client
`Player` type.

Auto-assignments made before this migration carry no lot id and stay non-reversible;
the link was never recorded and cannot be reliably backfilled. Those rows remain
correctable through the existing admin assignment panel. Production is to be checked
for affected rows before shipping rather than assumed empty.

## Testing

pgTAP:

- A full nemesis chain on the four-team fixture, run to completion, asserting strict
  alternation and a balanced final split.
- Rejections: a captain who is not on the clock, an unknown or already-placed team, a
  pick before the draft has started, a pick after completion, and a start while the
  auction is not complete.
- `nemesis_undo` returns the clock and the division; undoing pick 0 is refused.
- `nemesis_reset` clears every pick and every division.
- Admin-only grants for start, undo, and reset; anon cannot execute any of the four.
- A sale that triggers a forced auto-assign, then undone: the auto-assigned player is
  back in the pool, the team's points are refunded for both the sale and the 1-point
  assignment, and the stamp is cleared.

Vitest:

- `nemesis.ts` — phase transitions, on-the-clock derivation, next division, alternation
  across a full chain, and the empty and complete edges.
- `NemesisBoard` — turn gating (only the captain on the clock sees pick buttons), the
  admin seed panel, and the complete state.
- The undo confirmation names cascaded players when the last sale has any.

## Scope Notes

- No timer, and no schedule generation. Divisions feed the existing schedule as they do
  now.
- The nemesis draft is not surfaced on `/captain`; it lives on the draft board.
- Do not change how `teams.division` is consumed elsewhere.
