# Expeditions, the next level — design

Six features on top of the expedition routes described in
`docs/backend.md` ("Expedition routes", the design of record): archetype
abilities on the road, a base camp, a league expedition of the week, the
road ahead earned rather than shown, an atlas, and a living map. Every
assumption below was checked against the code on 2026-09-23 (newest
migration `20261025000001`, newest pgTAP test `0129`, run rules default 5).

## 0. Principles that every feature obeys

- **Derived, not stored.** The road, the journal, the encounters and now
  the abilities and the fog are computed from the run's columns
  (`id`, `rules`, `convoy`, `road`, `started_at`, `resolves_at`, `forks`,
  `choices`) plus the squad's frozen card json. New tables exist only for
  things that are genuinely state: a purchase, a reveal paid for, a goal
  that fell, a landmark named first, a reward paid.
- **Rules version 6.** `ARCHETYPE_RULES = 6` (in `src/lib/expeditions/archetypes.ts`)
  is the rulebook from which a run has abilities, the tent, the ability
  reveals and the Speedrunner's storm immunity. Migration
  `20261026000001_expedition_rules_six.sql` moves the `rules` default to 6.
  A run stamped 5 or below resolves EXACTLY as today: its rand consumption,
  its journal text and its events are unchanged, because every new draw and
  every new line is behind `rules >= ARCHETYPE_RULES`.
- **The ceiling does not move.** Every ability lands inside the loot
  multiplier (`LOOT_MULT_CAP` 2.5), inside the 0–3 fragment cap, inside a
  boolean comp, or inside the merchant's Harvest price that the ceiling
  already carries. `maxExpeditionPayout()` stays 19050 and
  `resolve_expedition` is not redeclared. `config.test.ts` keeps proving it.
- **Guardrail.** Per-tier base-rate daily earnings stay under
  `MAXED_DAILY_STREAK` ($550). The only two things in this design that touch
  runs-per-day are the Speedrunner's clock and the second scouting slot;
  section 8 shows the arithmetic and names the tests that hold it.
- **Money and shared state move in RPCs.** Camp purchases, forged policies,
  reveals, goal rewards, landmark naming and road awards are each one
  security-definer RPC, service-role only, checked under a row lock, and
  every dollar movement writes a `betting_ledger` row in the same
  transaction (`reason` values: `expedition_camp`).
- **Survives unapplied migrations.** Every new table is read by a
  separate query that fails soft to "feature hidden" (never added to
  `RUN_COLUMNS`); rules-6 behaviour keys off the `rules` the DB stamped; the
  14-argument `launch_expedition` is only called when a forged policy is
  requested, which needs a camp row, which needs the migration. Section 7
  lists the per-phase guarantee.
- **Hidden information never reaches the browser.** The page (a server
  component) derives per-run views and passes only what the squad knows.
  Client components stop importing `routes.ts`/`journal.ts`; a test reads
  their source and fails if they do.

## 1. Archetype abilities on the road

### 1.1 Player-facing rules

Every card carries a title (`card.archetype`, frozen at mint from
`ARCHETYPES` in `src/lib/cards/build.ts`; `FALLBACK_ARCHETYPE` "Jack of All
Trades"). From rules 6 every title is an **edge** on the road:

- An edge belongs to a **kind** (guard, rival, camp, …). **At most one edge of
  each kind counts per squad**: the one with the higher `power`; ties go to
  the card with more trail miles, then the lower inventory id. The picker
  says which count and which are ignored, so squad building is choosing
  three different kinds.
- An edge is read off the **frozen copy** (`copy.card.archetype`, exact
  title string, trimmed). A title the table does not know reads as Jack of
  All Trades. Relics, moments and plates carry whatever title their json
  has; a dead card's edge stops the moment it dies (`alive()`).
- Edges fire inside the run and are written as `RouteEvent`s carrying
  `ability: <title>`, so the ceremony lists them; the journal's first leg
  gains one line naming the squad's edges; the fork buttons say what an edge
  does to THAT choice; the picker shows the title, kind and one-line effect
  under each card.

### 1.2 The table (57 titles; constants live in `archetypes.ts`)

Constants: `EDGE_SMALL 0.05`, `EDGE 0.1`, `EDGE_BIG 0.15`, `STREAK_CAP 3`,
`HEATER_STREAK 0.05`, `CONDUCTOR_STREAK 0.03`, `SPEEDRUN_HOURS 1`,
`SPEEDRUN_MAX_HOURS 24`, `COINFLIP_SWING 2`, `FREE_WIN_LOSE 0.1`,
`LIFELINE_RESCUE 0.15`, `LIFELINE_BENCH_HOURS 48`, `MERCHANT_DRAW 2`,
`GANK_WIN_MULT 2`, `ISLAND_HOLD 0.2`, `HYPERCARRY_LAST 1.75`.

| # | Title | Kind | Power | Effect (exact) | Hook |
|---|---|---|---|---|---|
| 1 | Pentakill Machine | loot | 3 | The first push of the run that harms nobody adds +0.15 more. | push, once |
| 2 | On A Heater | momentum | 2 | Consecutive pushes carry on every route: +0.05 × streak (cap 3) to the push bonus. Mythic momentum stacks; its death roll unchanged. | push |
| 3 | Glass Cannon | loot | 1 | Every push adds +0.05; harm rolls that land on this card are ×1.5 (capped at 1). | push, harm |
| 4 | The Surgeon | guard | 2 | Wound rolls on the whole squad ×0.75. | harm |
| 5 | Highlight Reel | mutation | 2 | `pushReward` and `campReward` chances ×1.5. | reward |
| 6 | Coinflip Gamer | gamble | 3 | A gamble fork's swing doubles both ways (bonus ×2, `down` ×2). On a route with no coin flip the run's FIRST push is a coin (one extra draw): heads doubles its bonus, tails pays none; harm as normal. | gamble / push |
| 7 | Born Winner | rival | 1 | A rival that beats the squad costs nothing (`RIVAL_LOSS_LOOT` waived). | encounters |
| 8 | Clutch Gene | finale | 2 | The last fork's push rolls its harm at ×0.5. | last fork |
| 9 | Speedrunner | clock | 2 | Routes of ≤ 24h resolve 1 hour sooner (set at launch by the app when the DB is on rules 6; a convoy guest keeps the host's clock). Storms never hold the squad on any route. | launch, derivation |
| 10 | The Anchor | shield | 1 | The first wound rolled on this card is ignored. | harm |
| 11 | The Veteran | call | 1 | This card's own role call takes `VETERAN_SHAPE` whatever its miles. | call |
| 12 | The Underdog | finale | 1 | If squad shine ≤ tier gate + 3, +0.15 at the finale. | finale |
| 13 | Ice In The Veins | warned | 2 | A warned fork's curse never sticks to this card (harm still counts). | warned |
| 14 | Farm Demon | camp | 1 | Every camp (not a hold) adds +0.05. | camp |
| 15 | Lane Bully | loot | 2 | The first fork's push bonus ×1.5. | fork 0 |
| 16 | Gold Hoarder | merchant | 2 | The merchant pays Harvest prices (`HARVEST_MERCHANT` ×2) in any weather; never more. | claim |
| 17 | Plate Collector | toll | 1 | Tolls cost half. | toll |
| 18 | Wave Manager | camp | 1 | Camp wound rolls ×0.5. | camp |
| 19 | Free Win Lane | gamble | 2 | A gamble's lose chance −0.10; on a route without one, the first fork's camp carries no camp risk. | gamble / camp |
| 20 | Island King | hold | 2 | A hold pays +0.2 and may be called twice a run. | hold |
| 21 | Split Pusher | front | 1 | Harm never lands on this card while another living card can take it (one re-draw). | victim |
| 22 | Weakside Warrior | guard | 2 | Harm rolls on this card ×0.5. | harm (self) |
| 23 | Unkillable | shield | 3 | The first harm rolled on this card — wound, loss or death — is ignored. | harm |
| 24 | The Juggernaut | front | 2 | Takes the hit for a squadmate; wound rolls on it ×0.75. | victim |
| 25 | Jungle Diff | reveal | 2 | The next two checkpoints ahead are known. | views |
| 26 | Power Farmer | camp | 2 | Every camp (not a hold) adds +0.08. | camp |
| 27 | Gank Squad | rival | 2 | A rival beaten pays double (+0.4). | encounters |
| 28 | Counter Jungler | ghost | 2 | A ghost met leaves its cache whether or not it stood (+0.15) and never doubles the haunting. | encounters, camp |
| 29 | Tempo Setter | clock | 1 | Storms never hold the squad. | derivation |
| 30 | Camp Thief | rival | 3 | Takes the rival's cache: every rival met, won or lost, adds +0.15 on top of the verdict. | encounters |
| 31 | Tempo Conductor | momentum | 1 | +0.03 × streak (cap 3) everywhere; on the Mythic route `MOMENTUM_DEATH` grows at half rate. | push |
| 32 | Roaming Threat | call | 2 | The Mid's roam rolls its harm on one card, not two. | call |
| 33 | Priority Merchant | toll | 2 | Tolls are waived. | toll |
| 34 | Burst Mage | loot | 2 | A push at a dark fork adds +0.1 more. | push |
| 35 | The Assassin | guard | 2 | Lost and dead rolls on this card ×0.5. | harm (self, deep) |
| 36 | The Hypercarry | finale | 3 | The last fork's push bonus ×1.75. | last fork |
| 37 | Positioning God | guard | 2 | Harm rolls on this card ×0.25. | harm (self) |
| 38 | Late Game Insurance | finale | 1 | A multiplier under 1 at the finale is raised to 1. | finale |
| 39 | Turret Melter | find | 1 | Free-pack finds (`pushFind.comp`) ×2. | find |
| 40 | Silent Carry | mutation | 1 | This card never comes home Haunted. | mutate |
| 41 | The Warden | reveal | 1 | Every checkpoint ahead shows its danger (warned, dark, toll); the next one is known. | views |
| 42 | The Bodyguard | front | 2 | Takes the hit for a squadmate; the first wound on it is ignored. | victim |
| 43 | The Engage | loot | 2 | A push at a fork whose camp is not safe (camp risk or toll) adds +0.1. | push |
| 44 | The Lifeline | rescue | 2 | Rescue chance +0.15; every wound this run benches 48h, not 72h. | rescue, finale |
| 45 | Roam Enjoyer | find | 2 | Relic hunters always have a fragment. | derivation |
| 46 | Poke Support | camp | 2 | Camp wound rolls ×0 (haunting unchanged). | camp |
| 47 | Vision Denier | ghost | 1 | A ghost never doubles the haunting; `GHOST_HAUNT_FLOOR` does not apply. | camp |
| 48 | Sacrificial Play | front | 1 | Takes the hit for a squadmate; when it does, +0.15. | victim |
| 49 | Playmaker | loot | 1 | Any role-call push adds +0.05 more. | push |
| 50 | The Enabler | loot | 1 | The first time another edge fires this run, +0.05. | events |
| 51 | First Blood Merchant | merchant | 1 | The merchant is twice as likely to be a leg's beat. | derivation |
| 52 | The Frontline | front | 3 | Takes the hit for a squadmate; lost and dead rolls on it ×0.5. | victim |
| 53 | Space Creator | camp | 2 | Haunting rolls at every camp ×0.5. | camp |
| 54 | Duelist | warned | 1 | A push at a warned fork adds +0.1. | push |
| 55 | Executioner | loot | 2 | Every push that harms nobody adds +0.05. | push |
| 56 | Skirmish King | warned | 2 | Harm at a warned fork ×0.75 (whole squad). | harm |
| 57 | Jack of All Trades | jack | 0 | +0.05 at the finale. | finale |

`archetypes.test.ts` asserts the table's keys equal `ARCHETYPE_TITLES`
(a new export from `build.ts`: `ARCHETYPES.map(a => a.title)`) plus
`FALLBACK_ARCHETYPE`, and nothing else.

### 1.3 Where each hook lives (exact insertion points)

- **Derivation-time traits** (`traitsOf(copies, rules): AbilityTraits`,
  pure, in `archetypes.ts`): `{ stormproof, hunterFinds, merchantDraw,
  reveal: "none"|"next"|"two"|"danger" , speedrun }`. `encountersFor` gains
  a fourth argument `traits?: AbilityTraits`; under rules ≥ 6 it drops
  `storm` when `stormproof`, pushes `merchant` `MERCHANT_DRAW − 1` extra
  times when `merchantDraw`, and sets `found = true` on a hunter when
  `hunterFinds`. The page, the sweep and the claim all have the squad and
  pass the same traits, so they agree without a table.
- **Resolver** (`resolveRoute`): reads `activeAbilities(input.copies)` when
  `input.road.rules >= ARCHETYPE_RULES`, else `[]`. Every new draw is
  appended AFTER the existing draws of the same fork block (Coinflip's
  first-push coin after the victim/harm draws; Split Pusher's re-draw after
  the victim draw). The `harm()` helper takes a `scale` map computed per
  victim: `wound ×`, `deep ×` from guard/front/warned/finale edges;
  shield edges are counters on the fate map (`shielded: Set<copyId>`).
  `front` replaces the first drawn victim with the front card when alive
  and not already drawn (no draw consumed). `finale` edges apply after the
  insurance step and before the multiplier clamp.
- **Claim** (`claimExpeditionFor`): merchant = `MERCHANT_DOLLARS × 2` when
  Gold Hoarder is active (rules ≥ 6) or the week is Harvest — never both.
  `p_outcome.abilities = [{ copyId, title, kind }]` (active ones) is stored
  with the outcome (the RPC stores the whole document; no SQL change).
- **Launch** (`launchExpeditionFor`): when `fetchRulesVersion() >= 6` and a
  Speedrunner counts, `p_hours = durationHours − SPEEDRUN_HOURS` for tiers
  with `durationHours <= SPEEDRUN_MAX_HOURS`. `expedition_rules_version()`
  is a stable SQL function created by the rules-6 migration; missing (not
  applied) reads as 1, so the cut never fires ahead of the rules.
- **Fork options** (`forkOptions`): under rules ≥ 6 each option's `tease`
  gains an `edge` sentence, e.g. push: "Unkillable: the first harm on
  Kai is ignored." camp: "Poke Support: nobody is wounded at this camp."
- **Journal** (`roadJournal`): under rules ≥ 6, at leg 0 fraction 0.08:
  "The squad's edge: Camp Thief, Unkillable and Gold Hoarder." (ignored
  duplicates named as "a second Camp Thief, which counts for nothing").

### 1.4 Interactions

Convoys: each run rolls its own edges off the shared sheet (as loot and harm
already are). Campaigns: unchanged. Weather: Gold Hoarder under Harvest is
just Harvest. Rivals/ghosts: rival edges change only THIS run's multiplier,
never the verdict, so both journals still agree. Insurance: edges apply
before insurance; a shielded harm never reaches it. Trail titles: The
Veteran gives the shape, not the miles. Mythic: momentum edges add to the
bonus; only Tempo Conductor touches the death roll (halves its growth).

## 2. Base camp

### 2.1 Rules and numbers

One camp per collector, persistent across seasons and leagues (fragments
in `expedition_supplies` and the wallet are keyed by `discord_id` alone, so
the camp follows the wallet).

| Upgrade | Level | Price | What it does |
|---|---|---|---|
| Second squad slot (`slot`) | 1 | $1,500 + 1 fragment | Two Scouting Runs out at once. Scout only. |
| Tent (`tent`) | 1 | $600 | Absorbs the first camp-side harm per run (a camp wound or a camp haunting). |
| Tent | 2 | $1,200 + 1 fragment | Also absorbs the first toll paid. |
| Forge (`forge`) | 1 | $800 + 1 fragment | Unlocks forging: `FORGE_FRAGMENTS` = 2 fragments → 1 forged policy. Hold at most `FORGE_HOLD` = 2. |
| Forged policy (`policy`) | — | 2 fragments | Insurance on one launch: no `INSURANCE_FEE`, does NOT count against `insurancePerWeek`, at most `FORGED_PER_WEEK` = 1 forged launch per Eastern week. |
| Trophy wall (`wall`) | 1 | $300 | The wall on your board: campaign relics, accolades, landmarks you named, roads completed, ghosts met. |
| Trophy wall | 2 | $900 | The plaque: landmarks you named carry your crest on everyone's map and atlas. |

Tent under rules 6 only (it changes resolution). The tent is read at claim
time: the camp as it stands when the squad comes home covers the run.

### 2.2 Data model

```sql
create table public.expedition_camps (
  discord_id      text primary key references public.betting_profiles(discord_id),
  slots           int  not null default 0 check (slots between 0 and 1),
  tent            int  not null default 0 check (tent between 0 and 2),
  forge           int  not null default 0 check (forge between 0 and 1),
  wall            int  not null default 0 check (wall between 0 and 2),
  forged_policies int  not null default 0 check (forged_policies between 0 and 2),
  spent           bigint not null default 0,
  updated_at      timestamptz not null default now()
);
-- RLS: owner read (profiles join, the expedition_supplies pattern); service_role all.
alter table public.expedition_runs add column if not exists forged boolean not null default false;

create function public.expedition_camp_price(p_upgrade text, p_level int)
  returns table(dollars bigint, fragments int);   -- the price table, SQL-owned
create function public.upgrade_expedition_camp(p_user text, p_upgrade text, p_dollars bigint, p_fragments int)
  returns table(slots int, tent int, forge int, wall int, forged_policies int, balance bigint, fragments int);
```

`upgrade_expedition_camp`: `p_upgrade in ('slot','tent','forge','wall','policy')`;
locks `betting_profiles` and `expedition_supplies` rows; computes the next
level; `expedition_camp_price(next)` must equal `(p_dollars, p_fragments)` or
`raise 'bad price'` (the `open_card_pack` p_cost discipline); `'policy'`
needs `forge = 1` and `forged_policies < 2` ('forge not built' / 'forge is
full'); `'insufficient balance'`, `'not enough fragments'`, `'already
built'` at max level; writes `betting_ledger (discord_id, delta, reason)
values (p_user, -p_dollars, 'expedition_camp')` when dollars > 0; upserts
the camp row. `camp.test.ts` reads the newest migration declaring
`expedition_camp_price` and holds `CAMP_PRICES` in `camp.ts` equal to it.

`launch_expedition` (12-arg) is redeclared with the `20261020000001` body
plus exactly two changes: (a) the tier slot check becomes
`count(*) >= 1 + (case when p_tier = 'scout' then coalesce((select c.slots from expedition_camps c where c.discord_id = p_user), 0) else 0 end)`
→ `'tier already out'`; (b) the weekly insured count adds `and not r.forged`.
A new 14-argument wrapper
`launch_expedition(…, p_policy_week date, p_convoy text, p_forged boolean)`
locks the camp row, requires `forged_policies >= 1` ('no forged policy'),
refuses a second forged launch in the Eastern week ('forge spent this
week', counted over `expedition_runs.forged` since Monday ET), refuses
`p_tier in ('scout','exorcism')` ('policy not wanted'), decrements
`forged_policies`, calls the 13-arg wrapper with `p_insured = false` and the
tier fee only, then `update expedition_runs set insured = true, forged = true`
on the new run. The inner never sees a forged launch, so the weekly cap
check is untouched and forged runs are excluded from future counts.

### 2.3 App side

`camp.ts` (pure): `CAMP_PRICES`, `CampState`, `nextLevel`, `campCovers(camp, kind)`,
`scoutSlots(camp)`. `queries.ts`: `fetchCamp(supabase, discordId): CampState | null`
(fails soft to null). `actions.ts`: `upgradeCampAction(upgrade)`,
`forgePolicyAction()`. `runs.ts`: `launchExpeditionFor` accepts
`options.forged`; app-side pre-checks (camp exists, policy held, week not
spent) then calls the 14-arg RPC; otherwise the 13-arg as today. `resolveRoute`
takes `input.camp?: { tent: number }` (Phase 2 implements the hook: the
first camp wound/haunt that would land is absorbed → event "The tent held: …";
tent 2 also absorbs the first toll). `CampPanel.tsx` on the board: levels,
prices, buy buttons, the forge, and the wall (reads relics from `copies`
with `card.campaign`, accolades from `accolades`, landmarks/roads from the
atlas reads).

## 3. League expedition of the week

### 3.1 Rules

One shared goal per (season, Eastern week), derived from the week (nothing
to configure): weeks alternate by hash between a **landmark** (the league
walks toward it on combined trail miles, `LANDMARK_MILES` = 40) and a
**boss** (its health falls with every pushed fork, `BOSS_HEALTH` = 24 pushes).
It is themed on the week's fixtures: the landmark is "The <TeamA>–<TeamB>
Ridge", the boss "The <TeamB> Colossus", taken from the week's first fixture
(`fixtures` rows in the week; a week with none is "The Cairn of the Week").
A run counts for the week it LAUNCHED in (the calendar the weather and the
brief keep) and only once claimed. When the goal falls, every collector who
contributed at least one mile/push receives **one map fragment**; the top
contributor also receives the week's **Vanguard** stamp (a chip on the board
next week). A goal that has not fallen by the end of the following week
simply stops being evaluated.

### 3.2 Data model

```sql
create view public.expedition_league_progress as
  select r.season,
         date_trunc('week', r.started_at at time zone 'America/New_York')::date as week_start,
         r.discord_id,
         coalesce(sum(public.expedition_trail_miles(r.tier)), 0)::int as miles,
         coalesce(sum((r.outcome ->> 'pushes')::int), 0)::int as pushes
  from public.expedition_runs r
  where r.claimed_at is not null and r.tier <> 'lost'
  group by 1, 2, 3;
grant select on public.expedition_league_progress to anon, authenticated, service_role;

create table public.expedition_league_goals (
  season text not null, week_start date not null, kind text not null check (kind in ('landmark','boss')),
  target int not null, fell_at timestamptz not null default now(), top_id text,
  primary key (season, week_start));
create table public.expedition_league_rewards (
  season text not null, week_start date not null, discord_id text not null references public.betting_profiles(discord_id),
  fragments int not null default 1, top boolean not null default false, awarded_at timestamptz not null default now(),
  primary key (season, week_start, discord_id),
  foreign key (season, week_start) references public.expedition_league_goals(season, week_start));
-- both: public read policy (league news), service_role all.

create function public.fell_expedition_league_goal(p_season text, p_week date, p_kind text, p_target int)
  returns table(fell boolean, rewarded int, top_id text);
```

The RPC recomputes progress from `expedition_runs` with the view's
expression (miles for `landmark`, pushes for `boss`); if below `p_target`
returns `(false, 0, null)` and writes nothing; else `insert into
expedition_league_goals … on conflict do nothing`; if the row already
existed returns `(true, 0, top_id)`; otherwise inserts one reward row per
contributor `on conflict do nothing`, upserts `expedition_supplies.fragments
+ 1` for each inserted reward, flags the top contributor (highest stat, ties
to the lower discord id). Idempotent exactly like `close_expedition_season`.

### 3.3 App side

`league.ts` (pure): `leagueGoalFor(season, weekStart, fixtures): LeagueGoal
{ kind, title, target, blurb }`, `goalProgress(rows)`, `myShare(rows, me)`.
`queries.ts`: `fetchLeagueProgress(supabase, season, weeks[])`,
`fetchLeagueGoals(supabase, season, weeks[])` (fail soft). Sweep
(`sweepLeagueGoals(service, now)` in `leagueSweep.ts`, called once from
`sweepExpeditions`): for this week and last, per season present in the
progress view, derive the goal, and when progress ≥ target call the RPC;
when `fell && rewarded > 0` post one Discord embed. `LeagueGoalPanel.tsx`:
title, progress bar, your share, contributors, "fell Thursday — a fragment to
everyone who walked". The map (Phase 7) draws the landmark/boss at the
route's end with the same progress.

## 4. The road ahead is earned

### 4.1 What shows today (verified)

- `RouteMap.tsx` renders a `<circle>` per checkpoint with a `<title>` of
  `forksFor(tier, road)[index].title` — every future place is one hover away.
- `ExpeditionBoard.tsx` is `"use client"` and imports `forksFor`, `forkOptions`,
  `journalFor`, `banterFor`; it receives `run.id/rules/convoy/road`, so the
  whole road is computable in the browser and `ROADS` ships in the bundle
  (`ExpeditionRules.tsx` also imports `ROADS` to count places).
- `ForkPrompt` shows only the OPEN fork's title/story/options (fine).
- The journal names a place on arrival (when the fork opens — fine) and the
  Jungle's `SCOUTED_LINES` names the NEXT place after a `scout` (an intended
  reveal). The sweep's ping quotes the latest line (the open fork — fine).
- The convoy announcement names the current fork (fine).

### 4.2 Reveal rules (`reveal.ts`, pure)

Checkpoint `i` is **known** when any holds:
(a) it is open, decided or missed; (b) fork `i−1` was answered `scout`;
(c) trail: a Trailworn card in the squad knows the next undecided checkpoint,
a Veteran the next two, a Wayfarer the whole road; (d) rules ≥ 6 edges:
Jungle Diff the next two, The Warden the next one plus the danger flags of
every checkpoint; (e) a paid reveal (`expedition_reveals` row) — the whole
road; (f) in a convoy, the partner's paid reveal counts; (g) a claimed run —
everything; (h) a campaign road (`run.road` handed down) — everything.
An **unknown** checkpoint is shown as a `?` roundel; its `warned` flag is
always exposed as a dread mark ("the squad has a bad feeling about the
third stop"); The Warden also exposes `dark` and `toll`. Nothing else about
an unknown place leaves the server. (a)(b)(c)(e)(f)(g)(h) apply to every run
in the field from deploy (presentation); (d) only under rules 6.

### 4.3 Stored state and RPC

A fragment reveal needs state — it is paid for. `expedition_reveals (run_id
bigint primary key references expedition_runs(id), discord_id text not null,
revealed_at timestamptz default now())`, owner read, service_role all.
`reveal_expedition_road(p_user text, p_run bigint) returns table(fragments int)`:
the run is the caller's, unclaimed, `forks > 0`, not already revealed
('already revealed'); locks `expedition_supplies`; requires `REVEAL_FRAGMENTS`
= 1 ('not enough fragments'); decrements; inserts. `revealRoadAction(runId)`.

### 4.4 Server-derived views (`views.ts`)

`runViewFor({ run, copies, now, camp, landmarks, reveals, partnerReveal })`
returns a serialisable `RunView`:

```ts
interface PlaceView { index; known: boolean; key: string|null; title: string|null; warned: boolean; dark: boolean|null; toll: boolean|null;
  status: ForkStatus; pushed: boolean; landmark: { by: string; mine: boolean; crest: boolean }|null; revealedBy: "walked"|"scout"|"trail"|"edge"|"fragment"|"convoy"|"campaign"|null }
interface JournalLineView { at: string; leg: number; kind: JournalEntry["kind"]; text: string; encounter?: EncounterKey; fraction: number }
interface OpenForkView { index; title; story; banter: string|null; options: ForkOption[]; opensAt: string; closesAt: string }
interface RunView { runId; road: PlaceView[]; journal: JournalLineView[]; nextAt: string|null; openFork: OpenForkView|null;
  edges: { copyId; title; kind; counts: boolean }[]; company: { rivals: {leg; name; won}[]; ghosts: {leg; name}[] } /* surfaced legs only */;
  storm: { leg; at: string }|null; revealable: boolean; tent: number }
```

The page builds `views: Record<runId, RunView>` and passes it; `ExpeditionBoard`
renders `views[run.id]` and no longer imports `routes.ts`/`journal.ts`. The
client-safe pieces it still needs (`forkWindows`, `forkViews`, `openFork`,
`choiceSheet`, `isCampChoice`, `ForkChoice`, `ROLE_CALLS`, `FRAGMENT_CHANCE`,
`ROAD_SIZES`) move to `forks.ts`, re-exported by `routes.ts` so nothing else
changes. `nextAt` lets the board `router.refresh()` when the next line is
due, replacing the client-side journal clock.

## 5. The atlas

### 5.1 Derived vs stored

- **Derived**: the codex itself. `atlasFor(runs, landmarks)` walks the
  collector's CLAIMED runs: places from `outcome.atlas.places` when present,
  else `forksFor(tier, roadOf(run))` keys; encounters from
  `outcome.atlas.encounters`, else `encountersFor(run)` keys (rival/ghost
  unnamed); ghosts from `outcome.atlas.ghosts` only. Grouped per tier with
  met counts and first-met dates.
- **Stored at claim** (no SQL change: `resolve_expedition` stores the whole
  document): `p_outcome.atlas = { places: string[], encounters: string[],
  ghosts: [{ grave, name, owner }] }` for every claim from deploy.
- **Stored as state**: landmarks and road awards.

```sql
create table public.expedition_landmarks (season text not null, place text not null, discord_id text not null references public.betting_profiles(discord_id),
  run_id bigint not null references public.expedition_runs(id), reached_at timestamptz not null default now(), primary key (season, place));
-- public read (league news), service_role all
create table public.expedition_atlas_awards (discord_id text not null references public.betting_profiles(discord_id), season text not null, tier text not null,
  fragments int not null, comp boolean not null default false, awarded_at timestamptz not null default now(), primary key (discord_id, season, tier));
-- owner read, service_role all
create function public.expedition_road_size(p_tier text) returns int;      -- scout 4, gilded 6, raid 6, legend 9, rescue 3, exorcism 0, legendary 12, mythic 10
create function public.expedition_road_reward(p_tier text) returns table(fragments int, comp boolean); -- scout 1, gilded 1, raid 1, legend 2, rescue 1, exorcism 0, legendary 2+pack, mythic 3
create function public.name_expedition_landmarks(p_user text, p_run bigint, p_places text[]) returns setof public.expedition_landmarks;
create function public.award_expedition_road(p_user text, p_season text, p_tier text) returns table(awarded boolean, fragments int);
```

`name_expedition_landmarks`: the run is `p_user`'s and claimed; `p_places`
must be contained in the run's stamped `outcome->'atlas'->'places'` ('places
not walked'); inserts each `on conflict do nothing`; returns the rows THIS
call created (first claim wins; the app announces "X was first to the
drowned chapel"). `award_expedition_road`: counts distinct stamped places
over the collector's claimed runs for (season, tier); below
`expedition_road_size` → 'road not complete'; inserts the award `on
conflict do nothing`; only when inserted credits `expedition_supplies` and,
for `comp`, `card_pack_comps` (the `resolve_expedition` upsert). `atlas.test.ts`
holds `ROAD_SIZES`/`ROAD_REWARDS` equal to the SQL by reading the migration.
`scripts/backfill-expedition-atlas.ts` (owner-run, service role) stamps
`outcome.atlas` on older claimed runs and names landmarks in `claimed_at`
order, so history can count if the owner wants it to.

The claim, after a successful resolve: calls `name_expedition_landmarks`
with the run's places, then `award_expedition_road` when `atlasFor` says the
road is now complete (idempotent anyway). Both best-effort after the write,
logged on error, never failing a paid claim.

### 5.2 Surface

`AtlasPanel.tsx`: per tier a grid of roundels (met places titled, unmet as
`?` — the ROADS titles of unmet places are NOT sent; only counts and met
entries), encounters and ghosts met, road completion "7 of 9 · 2 fragments
when the road is walked", landmarks you named, and the league's landmarks
("first reached by <name>", with a crest for wall level 2). The living map
tags a known checkpoint with its landmark line.

## 6. The living map

### 6.1 Art direction — "an engraved night chart"

The site is a dark canvas (`--color-canvas #080d12`, `--color-surface
#111820`) with hatched backdrops (`bg-hash`), italic uppercase display type
(`type-display`, Chakra Petch), Saira body, Cinzel engraving, mono labels,
and a small set of accents: gold `#f5b62e`, coral `#ff6b35`, mint `#2ee6a8`,
cyan `#35e6ff`, pink `#ff3d84`, purple `#b06bff`, steel `#9baab8`, banana
`#f5d04e`; the expedition surfaces already speak in steel roundels struck
gold (`ExpeditionMark`), ember frames (`legend-embers`) and mutation overlays
(`card-mut-*`). The map is drawn in that language: **thin light ink on the
canvas**, a cartographer's night chart, never a game-engine map.

- **Palette**: contours steel at 22% opacity; the route ahead steel at 60%,
  dashed; the walked route gold; the squad coral with a gold rim; rivals pink;
  ghosts steel at 45% with a blur; landmarks gold; danger (warned) coral;
  fog a hatch of steel at 14% over the canvas; text in `--color-content` and
  `--color-muted`.
- **Line weights** (in the 720×220 viewBox): contours 0.5; route ahead 1.5
  dashed 4/3; walked route 2.5 round caps; roundels 1.5 stroke, r 6 (open fork
  r 8 with a 2.4s pulse); glyphs 1.5 stroke, 18×18; pins 1; labels mono 10px
  uppercase tracking 0.14em, place titles `type-display` 12px.
- **Terrain per tier** (one `<g class="terrain">` per tier, hand-authored
  paths, no images): scout — meadow contours and a river line; gilded — a
  paved band with gold milestone ticks; raid — valley contours, pylon and
  cooling-tower glyphs; legend — descending contours, a cave hatch under the
  path; rescue — a palisade camp at the end; exorcism — no terrain, a salt
  circle; legendary — contours that break into a star-field of 40 dots past
  the threshold; mythic — inverted: white ink at 80% on a deeper void, the
  path crossing itself once (existing silhouette kept).
- **Glyph set** (`mapGlyphs.tsx`, monoline 18×18, ~16 glyphs keyed by place
  family): bridge, gate, ledger, lantern, mask, stair, reactor, water, mast,
  ridge, barricade, kennel, shaft, chapel, furnace, checkpoint, village,
  bell, vault, throne, sleeper, camp, boat, barn, threshold, doors, choir,
  mirror, rift, sky, tide, table, keeper, void-road, orrery, hollow,
  cathedral, eclipse, throne-glass, shore, door. Unknown place → `?`.
- **Journal on the path**: each surfaced line drops a numbered pin at
  `fraction` along the path (encounter pins gold, trail pins steel, arrival
  pins white); hover/tap shows the line in a caption below the map (no
  tooltips on phone).
- **Weather on the map**: Fog — denser hatch, contours at 10%, a 40s drift;
  Drought — a warm banana wash at 6% and a cracked-riverbed pattern; Harvest
  — gold grain flecks along the margins; Watch — a thin cyan eye vignette and
  every rival marker drawn; Clear — nothing. A storm encounter draws a cloud
  glyph over its leg with a diagonal rain hatch for its span.
- **Company**: the rival's marker walks the rival's leg one path-width
  above the route; a ghost marker trails the squad on its leg; a convoy
  partner shares the squad marker with a second dot.
- **Motion** (CSS/SMIL only; no JS loop): the squad marker's `transform`
  transitions 600ms ease on each clock tick (the board already ticks);
  the walked stroke uses `stroke-dashoffset` transition; the open fork's
  roundel pulses (existing 2.4s); fog drifts 40s linear; rain hatch 1.2s.
  `@media (prefers-reduced-motion: reduce)`: no drift, no pulse, no rain, the
  marker jumps.
- **Layout**: desktop 1280 — the map is full card width, 720×220 viewBox,
  labels on every known checkpoint, pins with numbers; phone 390 — same
  geometry scaled (`preserveAspectRatio="xMidYMid meet"`), labels only on
  the open fork and the next known one, pins unnumbered, caption below.
- **Performance**: one inline SVG per run, ≤ 250 nodes, at most one
  `feGaussianBlur` (ghost) — fog is a `<pattern>` mask, not a filter; no
  new npm dependencies (SVG + Tailwind v4 utilities only).

### 6.2 Verification

`/admin/expedition-map` renders `LivingMap` from fixtures (no reads, no
writes; staff-gated by `fetchStaffTier`, open when `NODE_ENV === "development"`)
in six states × two tiers (legend, mythic): fresh run, mid-leg (journal pins,
rival), fork open, fog + unknowns (Fog week, two `?` roundels, one dread
mark), storm (Watch week + storm leg), finished (claimed, all known, landmark
line). `e2e/expedition-map.spec.ts` screenshots each state at 1280×800 and
390×844 into `e2e/screenshots/expedition-map/` (gitignored; attached to the
PR). The owner reviews; the plan's Phase 8 is the loop.

## 7. Rules version and deploy safety

| Phase | Reads/writes that need SQL | Behaviour with the migration NOT applied |
|---|---|---|
| 1 rules six | `rules` default 6, `expedition_rules_version()` | DB stamps 5; every rules-6 branch stays off; `fetchRulesVersion` fails soft to 1. |
| 2 abilities | none (behind `rules >= 6`) | Off until a run is stamped 6. |
| 3 camp | `expedition_camps`, `forged`, 12-arg redeclare, 14-arg wrapper | `fetchCamp` → null → panel hidden; one scout slot; `forged` never requested; the 13-arg call is unchanged. |
| 4 league goal | view, goals, rewards, RPC | Reads fail soft → panel hidden; the sweep step catches the error and skips. |
| 5 road ahead | `expedition_reveals`, RPC | Reveal button hidden when the reveals read errors; fog still works (derived). |
| 6 atlas | landmarks, awards, RPCs | Reads fail soft → landmarks absent, awards absent; claim's RPC calls are best-effort and logged. |
| 7–8 map | none | — |

`release.yml` auto-releases develop Mondays 13:00 UTC; the owner applies
migrations by hand. Every phase above is mergeable ahead of its migration.

## 8. Economy analysis (the guardrail holds)

Base-rate per-tier daily (unchanged tables): scout 232.5, raid 271, legend
543.75, legendary 529.2, mythic 534.4, rescue 122, gilded 879.5 (patron
exception, < 1100), all < 550 except the intended gilded line.

- **Speedrunner** (1h off routes ≤ 24h): scout 77.5×24/7 = 265.7; raid
  271×24/23 = 282.8; rescue 61×24/11 = 133.1. Legend at 47h would be 555.3 —
  which is why the cut stops at 24h (`SPEEDRUN_MAX_HOURS`); long routes get
  storm immunity instead. Test: `expectedDailyDollars(tier, hours)` gains an
  optional `hours` argument; `config.test.ts` asserts every tier with
  `durationHours <= SPEEDRUN_MAX_HOURS` at `durationHours − SPEEDRUN_HOURS`
  stays under `MAXED_DAILY_STREAK`.
- **Second scouting slot**: 2 × 232.5 = 465; with a Speedrunner 2 × 265.7 =
  531.4 < 550. Test: `expectedDailyDollars("scout", 8 − 1) × (1 + CAMP_SLOTS_MAX) < 550`.
- **Edges on the multiplier**: every loot edge adds to `lootMultiplier`,
  clamped at `LOOT_MULT_CAP` — the same envelope caches, rivals and holds
  already use. The ceiling is unchanged (19050); `config.test.ts` still reads
  it off `20261015000001` because no newer migration declares
  `resolve_expedition`.
- **Gold Hoarder**: merchant ≤ `MERCHANT_DOLLARS × HARVEST_MERCHANT` = 150,
  already in the ceiling. **Lifeline** bench 48h < the RPC's 8-day bound.
  **Fragments**: hunter/finds still capped at `FRAGMENT_CAP` 3 by the resolver.
- **Sinks**: camp $5,300 + 4 fragments over all levels; forging 2 fragments
  per policy; reveal 1 fragment. **Fragment sources added**: league goal 1 per
  contributor per week; road completion 1–3 per road per season. Fragments
  are not dollars; their only dollar path is the Legendary/Mythic route,
  whose per-day rates stay under the streak.

## 9. Decisions for the owner (defaults chosen; change in one place each)

1. Camp prices and levels (`CAMP_PRICES` in `camp.ts` = `expedition_camp_price` in SQL).
2. Forged policies outside the weekly insurance cap, one forged launch a week (`FORGED_PER_WEEK`).
3. Second slot for Scouting Runs only.
4. Speedrunner: 1h off routes ≤ 24h only (guardrail), storm immunity elsewhere.
5. League goal sizes 40 miles / 24 pushes, reward one fragment per contributor plus a Vanguard stamp for the top.
6. A reveal costs one fragment; partner's reveal shared in a convoy.
7. Fog applies to every run in the field from deploy; edge reveals only under rules 6.
8. Road completion counts runs claimed after the atlas ships; the backfill script is optional.
9. Stacking: one edge per kind, highest power, ties to miles then lower id.
10. The map preview page opens without staff in development.
11. Every magnitude in the ability table (section 1.2).
