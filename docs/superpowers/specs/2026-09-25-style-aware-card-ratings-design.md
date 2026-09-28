# Style-aware card ratings

Status: agreed in chat 2026-09-25 — 30 / 40 / 30 weights, farm and laning
judged against the same style, the style lenses below, cards only. The tank
lens is the league owner's (crowd control, damage taken, damage mitigated).
Ships behind a season gate: **Premier S6 and Academy A2 onward**. S1–S5 and
A1, including the seasons running when this was agreed, keep the old rating.

## Why

Measured on the four completed Premier seasons (S1–S4, 3,347 player-games,
`scripts/data/raw_stats.json`):

- **The rating judged every player in a role on one job.** In mid that job
  was a mage's: damage per minute and damage share carried ~23% of the score
  (damage share twice — in Damage and in Impact), kills ~4.5% and solo kills
  ~2%. Mid assassins average 33% more kills and 2.3× the solo kills of mid
  mages, and 10% less damage per minute.
- **Some styles' defining stats were never read.** Crowd control (tanks,
  engage supports) and heal/shield (enchanters) were not inputs at all.
- **So excelling at your style paid very differently by style.** Take the
  top quarter of each style's games on that style's own job stats and read
  where they land among all games in the role, winning left out (50 =
  average): mid mage 83, mid assassin 75, top tank 60, jungle tank 56,
  engage support 55, mage support 46.

## The rating

```
score = 30% winning + 40% fundamentals + 30% playstyle
OVR   = curve.base + curve.scale × score        (fitted per season, below)
```

**Winning** is the raw win rate, as before.

**Fundamentals** are the role's checklist, percentiled against the window's
role cohort like every bar before them:

| Bar | Built from | Graded against |
| --- | --- | --- |
| Laning | CS/min, and CS, gold and XP difference at 10 against the player in the same role on the other team | the player's own **style** |
| Farming | the same, for a jungler (vs the enemy jungler) | the player's own **style** |
| Teamplay | kill participation | the role |
| Survival | deaths per minute (fewer is better) | the role |
| Vision | vision score/min, plus wards cleared and control wards placed per minute | the role |
| Objectives | dragon, baron and objective damage per minute | the role |

A support's Laning leaves CS out. "Graded against the style" means each
style's typical offset from its role is taken off first — over S1–S4 a top
tank farmed about 0.3 CS/min under the role average and trailed its lane
opponent by about 6 CS at 10 — shrunk toward zero for styles history has
seen rarely: `n / (n + 30) × (style mean − role mean)`.

**Playstyle** grades each game on the job its champion does, against the
league's history of that style in that role. Champions are classed in
`src/lib/cards/playstyle.ts` (tank, bruiser, skirmisher, assassin, mage,
marksman, enchanter), read in the context of the role (Karma support is an
enchanter, Leona support is "engage"). Each style's lens:

| Style | Graded on |
| --- | --- |
| Assassin | kills/min 40%, solo kills/min 30%, damage/min 30% |
| Jungle carry | kills/min 40%, damage/min 35%, solo kills/min 25% |
| Mage | damage/min 50%, damage share 25%, crowd control/min 25% |
| Marksman | damage/min 40%, turret damage/min 35%, damage share 25% |
| Ranged top | damage/min 45%, turret damage/min 30%, damage share 25% |
| Bruiser | damage/min 35%, turret damage/min 25%, share of incoming damage mitigated 20%, solo kills/min 20% |
| Skirmisher | solo kills/min 35%, turret damage/min 35%, damage/min 30% |
| Mid fighter | damage/min 40%, solo kills/min 30%, kills/min 30% |
| Tank, engage support | crowd control/min 40%, share of the team's damage taken 30%, damage mitigated/min 30% |
| Enchanter | effective heal and shield/min 50%, assists/min 50% |

Each stat is placed in its style's historical distribution (0–100), the
lens averages them, and a week averages its games — each graded by its own
champion, so Zed then Orianna is an assassin game and a mage game. A
style-and-role pair with fewer than 20 historical games borrows its class's
games from every role (a Cho'Gath bot is graded as a tank).

Two stats were rejected because they pile up in losing games (point-biserial
r with winning, within style):

- **Bounty gold**, −0.23 to −0.37 outside support: shutdown gold is
  collected off enemies who are ahead.
- **Raw damage taken per minute** for tanks, −0.21 to −0.25: an enemy that
  is ahead hits harder. The tank lens uses the tank's **share of its own
  team's** damage taken instead, which is neutral (−0.04 to −0.08).

## The card

Five bars, as always — the card face has no room for a sixth. The first is
the style bar, labelled with the style the player mostly played that week
("Assassin", "Tank"; "Playstyle" when no style holds a majority), then the
role's four fundamentals:

| Role | Bars |
| --- | --- |
| Top | style · Laning · Survival · Teamplay · Vision |
| Jungle | style · Objectives · Farming · Teamplay · Vision |
| Mid | style · Laning · Survival · Teamplay · Vision |
| Bot | style · Laning · Survival · Teamplay · Vision |
| Support | style · Vision · Teamplay · Survival · Laning |

Weights inside the 40% for fundamentals (`FUNDAMENTAL_WEIGHTS`):

| Role | |
| --- | --- |
| Top | Laning 16 · Survival 10 · Teamplay 7 · Vision 7 |
| Jungle | Objectives 12 · Farming 10 · Teamplay 10 · Vision 8 |
| Mid | Laning 14 · Survival 10 · Teamplay 9 · Vision 7 |
| Bot | Laning 16 · Survival 10 · Teamplay 7 · Vision 7 |
| Support | Vision 14 · Teamplay 10 · Survival 9 · Laning 7 |

The card is still scored on exactly what it shows. Compare lines two cards'
style bars up under "Playstyle" when their styles differ.

## Season gate and rollover

`LEGACY_RATING_SEASONS` (`src/lib/cards/styleYardsticks.ts`) lists S1–S5
and A1. Those seasons' live cards, Season's End and any edition rebuild run
the old code path unchanged — verified byte-identical over every card of
all 26 historical weeks. Every other season is rated by playstyle.

The history a season is graded against — each style's stat distributions,
the farm/lane offsets, and the OVR curve — is its **yardstick**, generated
by `scripts/build-style-yardstick.ts` into
`src/lib/cards/styleYardsticks.json` and frozen per season, so rebuilding a
season's editions reproduces them.

- **At each rollover**, before the new season's first drop:
  `npx tsx scripts/build-style-yardstick.ts S6 A2`, then commit the file.
  S6 is graded against S1–S5; A2 against A1.
- **Academy** grades against its own history. A style its history has seen
  fewer than 20 times borrows Premier's games for that style alone, and the
  file lists what was borrowed. The entries committed now were built from
  the S1–S4 export: A2's is Premier's history outright (`borrowed: ["all"]`)
  until the rollover run reads A1 from the database.
- **If the run is skipped**, a season takes its league's newest yardstick
  rather than falling back to the old rating.
- **The curve** is fitted so the new rating mints as many Master-and-above
  cards a week as the old one did over the same weeks (Challenger count
  breaks ties), with the average card unchanged. Each history season is
  scored against the other seasons for the fit, as a live season is. Fitted
  on S1–S4: `22.56 + 0.83 × score`.

No migration: every column already exists on `raw_stats`, both fetch paths
select the new ones (`STYLE_GAME_COLUMNS`), and the yardstick is a file.

## What does not change

- Fantasy points and the homepage awards keep `powerRanking`.
- Frozen copies keep the bars and overall they were pulled with.
- Archetype titles, badges, highlights and form are computed as before.

## Evidence

The shipped engine on S1–S4, each season graded against the other three:

| | Old | New |
| --- | --- | --- |
| Master+ cards per week | 2.42 | 2.42 |
| Challengers per week | 0.69 | 0.88 |
| Average OVR | 64.0 | 63.9 |
| Average change per card | — | 3.6 (58% within ±3; 15 of 1,268 moved 12+) |
| Week-to-week consistency (same player, same role) | 0.28 | 0.25 |

Top quarter of each style's games at its own job, as a percentile among the
role's games with winning left out (50 = average):

| Role | Old | New |
| --- | --- | --- |
| Top | bruiser 75, tank 60, ranged 62, skirmisher 80 | bruiser 73, tank 78, ranged 75, skirmisher 83 |
| Jungle | bruiser 72, carry 75, tank 56, mage 81 | bruiser 78, carry 87, tank 66, mage 91 |
| Mid | mage 83, assassin 75 | mage 81, assassin 87 |
| Bot | marksman 83 | marksman 84 |
| Support | enchanter 74, engage 55, mage 46 | enchanter 87, engage 67, mage 72 |

The "top quarter at its own job" is picked with the stats the lens pays for,
so this shows the rating now pays for those stats; whether they are the
right stats per style is the judgement agreed above.

## Testing

- `playstyle.test.ts`: every bundled champion has exactly one class;
  role-aware styles; labels fit the card.
- `styleRating.test.ts`: grading against history (interpolation, ties),
  per-minute stats and missing clocks, class fallback, the 30/40/30 score
  through the curve, style-adjusted farm, lane diffs against the opponent,
  support laning without CS, ungradeable champions, and that no yardstick
  rates exactly as before.
- `styleYardsticks.test.ts`: the gate, the newest-yardstick fallback, and
  the committed file's shape.
- `styleYardstickBuilder.test.ts`, `scripts/build-style-yardstick.test.ts`:
  distributions, shrunk offsets, borrowing, history selection, formatting.
- `queries.test.ts`: both fetch paths select every column the rating reads;
  S6 prints style bars and S5 does not.

## Risks and open items

- **Locke** is classed as an assassin provisionally: no league games yet.
- **Thin histories.** Mid assassins are 55 games across S1–S4 (they won
  36%), so their yardstick is thin; S5 at rollover helps.
- **Tanks** gained most but are still the lowest-paid style at the top end
  (jungle tank 66, engage 67). Their job is the hardest to see in a stat
  line; the lens can be retuned in `STYLE_LENSES`.
- **Consistency dipped** from 0.28 to 0.25 week to week (standard error
  about 0.03). Part of the old figure was the same class being rewarded
  every week regardless of how it was played.
- Lens and fundamental weights are judgement, like the ones they replace.
