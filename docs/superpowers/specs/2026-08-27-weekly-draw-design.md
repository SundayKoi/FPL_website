# The Weekly Draw — design

2026-08-27. Status: approved direction, pending user review of this spec.

## What this is

The simplest game a card collection can host: **every copy in the league
is a raffle ticket**. Once a week the site draws one exact print — "S4
Jinx, Aurora, mint #7" — and whoever holds that copy wins the pot. One
sentence explains it: *one card wins every week — is it yours?*

Design intent:

- Zero decisions, zero rules to learn. Owning cards is playing.
- Makes every copy worth holding — including the commons Expeditions
  ignores — so it quietly rewards collecting and pack-ripping without
  touching pack odds or ratings.
- Past winning copies become league artifacts (permanent stamp),
  creating organic trade chatter.

## Game rules

- Draw cadence: weekly, aligned to the Monday-start `edition_week` the
  card system already uses. The draw covers the week just ended.
- Eligible tickets: every `card_inventory` row in the active season at
  draw time, uniformly weighted — one row, one ticket. Moments and
  relics included; more copies = more tickets, and that is the point.
- A copy deployed on an expedition still counts (locks restrict
  *leaving* the collection, not luck).
- Pot: fixed, from config — betting dollars plus one pack comp. No
  rollover in v1 (a missed week just doesn't happen: some row always
  wins because the draw picks from existing rows).
- The winning copy is stamped permanently: `card` json gains
  `drawWin: { weekStart }`; the renderers show a small laurel mark.
  The stamp is cosmetic provenance only — dust pricing reads existing
  columns, so the stamp changes nothing economic. If the copy is later
  melted, the win survives in history.

## Data model

One migration (plus pgTAP):

```sql
create table public.weekly_draws (
  season       text not null,
  week_start   date not null,
  copy_id      bigint not null,          -- card_inventory id at draw time;
                                         -- deliberately NO foreign key: the
                                         -- copy may be melted later and the
                                         -- draw record must outlive it
  discord_id   text not null,            -- winner, denormalized
  card         jsonb not null,           -- frozen snapshot of the winning copy
  pot          bigint not null,
  drawn_at     timestamptz not null default now(),
  primary key (season, week_start)
);
```

- Public read (anon + authenticated): the draw history is a leaderboard
  page and renders signed-out, like `fantasy_lineups`. Writes are
  service-role only — no insert/update policies at all.
- `card` snapshot is frozen at draw time so history survives melts and
  restyles (the card_inventory pattern: a collectible record does not
  silently restat).

### Draw procedure (service role)

`run_weekly_draw(p_season, p_week_start, p_pot)` RPC, one transaction:

1. Refuse if a row for `(season, week_start)` exists (idempotent —
   reruns are no-ops, the detect-moments workflow pattern).
2. Pick one `card_inventory` row for the season uniformly at random
   (`order by random()` is fine at league scale; revisit only if row
   counts ever make it slow).
3. Insert the `weekly_draws` row with the frozen snapshot.
4. Stamp the copy's `card` json with `drawWin`.
5. Credit the pot via the existing ledgered wallet grant; upsert the
   pack comp (`card_pack_comps`).
6. Queue an `announcements` row — the Discord poster does the rest.

## Scheduling

A GitHub Actions workflow (`weekly-draw.yml`, cron, Tuesday alongside
`detect-moments`/`weekly-brief` — after the week's games are ingested)
runs `scripts/weekly-draw.ts` with service-role env, calling the RPC.
Admin fallback: a "Run draw" button on the admin cards panel (the
per-season sync-button precedent) for missed or manual weeks.

## Surfaces

- `/cards` gets a Draw panel: last week's winning card rendered full
  (the winner's flame and all), the winner's name, this week's pot, and
  your ticket count ("You hold 34 tickets").
- `/cards/draw` history page: every past draw, its frozen card, its
  winner — the hall of lucky artifacts. Public.
- Winning copies render the laurel stamp everywhere the card renders
  (shelf, binder, trades, share page).

## Non-goals (v1)

- No ticket purchases, boosts, or weighting of any kind — uniform per
  copy, forever. (Weighting by rarity would turn the one game commons
  can win into another shiny-chase.)
- No rollover pots or jackpot escalation.
- No patron interaction: patrons hold no draw advantage beyond owning
  cards like everyone else. The supporters-page promise stays clean.

## Testing

- pgTAP: public read policy, service-role-only writes, idempotent rerun,
  pot ledger row written, comp upserted, stamp applied, snapshot frozen.
- Vitest: ticket-count query helper, panel rendering states (no draws
  yet / winner is you / winner is someone else), laurel stamp rendering.
- Narrow suites plus the README's broader checks before completion.

## Rollout

Same deploy-ordering rule as everything: migration applied to
production before the merge to main. The workflow file lands with the
code; its first scheduled run happens after both are live. Seed the
first announcement manually so the league learns the game exists.
