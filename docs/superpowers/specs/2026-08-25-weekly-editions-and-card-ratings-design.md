# Weekly card editions, a reachable rating curve, and role-aware bars

Status: approved in chat 2026-08-25, pending spec review.

Three changes ship together because they all land on the same read of the
card engine, but they are independent and can be reviewed separately.

## Why

Measured against a real 67-player season (S4, local copy of the historical
ingest):

- The rating curve made the top of the collection unreachable. Raw Power
  scores top out at **85.6**; `OVR = 28 + score × 0.68` maps that to 86,
  while Master needs 89 and Challenger 94. The season produced **zero**
  Challengers, **zero** Masters, three Diamonds.
- That emptied the pack economy's top shelf. "Legendary" is Master +
  Challenger, so every 1% legendary roll silently downgraded to epic —
  which was three cards.
- Season-cumulative stats regress everyone toward the middle. The same
  players over a single week reach raw scores of **87–96**, because
  two or three games spread percentiles that season averages compress.
- The Vision bar is dead weight on four of five roles. It never fed the
  overall (Bot's Power weights contain no vision term at all), and it is
  already scored against same-role peers, so it reads ~60 for everyone
  and tells the reader nothing.

## 1. Weekly editions

**Today.** `archiveEdition(supabase, season, week, cards)` freezes a week's
`card_editions` rows, and packs buy per edition
(`fetchEditionCards`). Both the weekly drop and the standalone archiver
feed it `fetchSeasonCards()` — season-to-*date* cards, merely captured on a
given Monday.

**Change.** Add a sibling builder that scopes the cohort to one week:

```
fetchWeekCards(supabase, season, week) -> PlayerCardData[]
```

It reads that week's `raw_stats`, aggregates with the existing
`aggregateWeeklyPlayerRows`, and runs the same `buildSeasonCards`. Nothing
downstream changes: the archive, the pack roller, the edition picker and
the collection all keep working on `PlayerCardData` exactly as they do now.

The weekly drop calls `fetchWeekCards` instead of `fetchSeasonCards` when
archiving. Because drops run weekly, this takes effect at the next drop
(week 3) with no flag or migration — **weeks 1 and 2 stay archived exactly
as they were**, and remain purchasable.

**A card's OVR changes meaning**, from "how good is this player this
season" to "how did this player play that week." Ratings become volatile by
design: one strong series mints a Challenger, a quiet week does not. The
edition label on the card front already carries the week, so the UI needs
copy making the window explicit rather than new structure.

**The live hub stays season-cumulative.** `/cards` and the share pages keep
answering "how is this player doing this season" — the living-card pitch —
while every *pulled* copy is a snapshot of one week. Confirm this before
implementation; the alternative (hub also weekly) is a one-line swap but
changes what the hub is for.

## 2. Rating curve

`OVR_SCALE` 0.68 → **0.72**. `OVR_BASE` stays 28.

Modelled on four real single-week cohorts:

| Curve | wk1 | wk2 | wk3 | wk4 |
|---|---|---|---|---|
| current `28 + .68` | 0 CHA, 2 MAS | 0, 0 | 0, 1 | 0, 2 |
| **`28 + .72`** | 1, 4 | 0, 1 | 1, 2 | 1, 3 |
| `30 + .75` | 5 (clamps 99) | 1, 3 | 3, 4 (clamps) | 4 (clamps) |

`28 + .72` gives roughly one Challenger in a strong week and none in a
quiet one, never reaches the 99 clamp (which would tie players and make
collector serials arbitrary), and keeps the numbers close to what the
league already recognises. The rejected `30 + .75` was tuned against
season-cumulative data and is far too generous once the window narrows.

**Frozen copies keep their old numbers.** A card pulled at 86/Diamond stays
86/Diamond while later prints of the same player rate higher. That is
consistent with freeze-on-pull, and it means pre-change copies are
systematically a tier lighter — which lowers their dust value and, as a
side effect, makes them cheaper against the fantasy salary cap.

## 3. Role-aware bars

Five slots stay, but **each role gets its own set**. Only the first and
last slots are shared, so every card stays comparable at a glance while the
middle three say what that role is actually for.

Bars are drawn from one vocabulary of measures, each a percentile against
the player's own role cohort (so a Support's Vision is judged against
Supports, never against ADCs):

| Measure | Built from |
|---|---|
| Combat | KDA, kills, kill participation, deaths (inverted) |
| Damage | damage/min, damage share |
| Economy | CS/min, gold/min |
| Laning | CS at 10, gold at 10 |
| Vision | vision score/min |
| Objectives | dragon + baron kills, objective damage |
| Turrets | turret kills, turret damage, plates destroyed |
| Survival | deaths (inverted), damage taken/min |
| Presence | kill participation, assists |

Assigned per role:

| Role | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Top | Combat | Laning | **Turrets** | Survival | Impact |
| Jungle | Combat | **Objectives** | Vision | Presence | Impact |
| Mid | Combat | **Damage** | Laning | Presence | Impact |
| Bot | Combat | **Damage** | Economy | Laning | Impact |
| Support | Combat | **Vision** | Presence | Survival | Impact |

Every column this needs (`dragon_kills`, `baron_kills`, `objective_damage`,
`turret_kills`, `turret_damage`, `turret_plates_destroyed`, `vision_score`,
`damage_taken`, `assists`, `kill_participation_pct`) already exists on
`raw_stats`. It does **not** exist on `stats_player_agg`, which has no
objective or turret columns at all — so both the weekly and the season
build paths must source these from the per-game rows the engine already
fetches. `CardGameRow` and `WEEKLY_STAT_COLUMNS` widen; **no migration**.

Clutch is retired as a universal bar. It was long-game win rate, which at a
weekly window is one or two games — closer to a coin flip than a stat.

**Slot 5, formerly Form, becomes window-dependent.** Consistency cannot be
measured across two or three games, so the bar means what the drop's window
can support:

- **Weekly editions — Impact:** the player's share of their team's damage
  and kills that week.
- **All-season edition — Consistency:** the share of the player's games
  clearing the league's median performance, so a reliably *good* player
  scores high and a reliably mediocre one does not.

Both render in the same slot with its own label, so the card reads honestly
in either drop.

## Testing

- `fetchWeekCards` scopes to one week and excludes adjacent weeks' games.
- The curve change: a known Power score maps to the expected OVR and tier.
- Each role resolves its own five-bar set, and an unknown or missing role
  falls back to a defined default set rather than rendering empty bars.
- Every measure computes from a fixture with a known answer, including the
  degenerate cases (zero objective damage; zero team damage).
- Frozen copies keep their stored bars: a pre-change card in a collection
  must render without a slot-3 or slot-4 crash.

## Risks

- **Small-sample volatility** is intended. Confirmed 2026-08-25 that every
  player plays a full series each week, so no minimum-games threshold is
  needed.
- **Bars on frozen copies.** Every card already owned carries the old five
  (`combat`/`economy`/`vision`/`form`/`clutch`). The renderer must key off
  the `subStats` the card actually carries — label and all — never off the
  role, or every collection, trade preview and binder breaks at once. This
  is the highest-risk part of the change.
- **The all-season drop does not exist yet.** Consistency has no shipping
  surface until it does; it can be built with the bar and left unused, or
  deferred until that drop is designed.
