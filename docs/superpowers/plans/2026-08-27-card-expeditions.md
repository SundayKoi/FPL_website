# Card Expeditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a squad of three owned cards on a timed expedition; foils and signed cards gate the better tiers; loot is dollars, pack comps, and permanent cosmetic marks stamped onto the cards that went.

**Architecture:** A pure config module (`src/lib/expeditions/config.ts`) owns every number — shine scoring, tier gates, reward bands, briefs. Trusted server actions compute shine/outcomes with the service client and call two security-definer RPCs (`launch_expedition`, `claim_expedition`) that enforce ownership, locks, daily limits, and payouts atomically. A `card_inventory` trigger is the hard guarantee that deployed copies cannot be melted or traded. Marks live in the copy's frozen `card` json and render as overlay layers.

**Tech Stack:** Next.js 16 App Router (READ `node_modules/next/dist/docs/` before writing any Next code — this Next has breaking changes), Supabase Postgres (RLS + security-definer RPCs + trigger), pgTAP, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-card-expeditions-design.md`

## Global Constraints

- Migrations are append-only; new file `supabase/migrations/20260901000001_card_expeditions.sql`; pgTAP in `supabase/tests/0069_card_expeditions_test.sql`.
- Cards are never lost or damaged; the outcome floor is a positive reward.
- Every dollar credit writes a `betting_ledger` row in the same transaction as the balance update.
- Day boundary for the launch limit is the **Eastern calendar day** (`America/New_York`), the `open_daily_pack` convention. Patrons (betting_profiles.patron_until > now()) get 2 launches/day, everyone else 1.
- Marks are economically inert: dust pricing reads existing columns (`tier`, `foil`, `foil_type`, `signed`) and must never read the mark.
- One mark per copy, replaceable only upward (trail < sigil < legend).
- DB enforces everything; UI checks are presentation only.
- Deploy ordering: migration applied to production (`tyywoneobreracfnujdk`, never `jmhgextkwsaodtnjtvvp`) **before** merging to main; the user runs `npx supabase db push`.
- Work on branch `card-expeditions` off `main` (after the weekly-draw branch merges — Task 4 reuses its `spendPackComp` helpers and `kind='standard'` comp support).
- Copy tone matches the cards pages: declarative, theatrical, never corporate.

---

### Task 1: Config module — shine, tiers, briefs, outcome rolls

**Files:**
- Create: `src/lib/expeditions/config.ts`
- Test: `src/lib/expeditions/config.test.ts`

**Interfaces:**
- Consumes: `CardCopy` from `src/lib/packs/queries.ts:32` (fields used: `tier`, `foil`, `foilType`, `signed`, `card`, `role`, `id`); `foilTypeOf`, `FoilType` from `src/lib/packs/config`.
- Produces (exact signatures later tasks call):

```ts
export type ExpeditionTierKey = "scout" | "raid" | "legend";
export type ExpeditionMark = "trail" | "sigil" | "legend";
export type OutcomeGrade = "poor" | "solid" | "jackpot";

export interface ExpeditionTierDef {
  key: ExpeditionTierKey;
  label: string;            // "Scouting Run" | "Deep Raid" | "Legend Hunt"
  durationHours: number;    // 8 | 24 | 48
  minShine: number;         // 0 | 12 | 20
  minFoils: number;         // 0 | 1 | 2
  minSigned: number;        // 0 | 0 | 1
}
export const EXPEDITION_TIERS: Record<ExpeditionTierKey, ExpeditionTierDef>;
export const MARK_RANK: Record<ExpeditionMark, number>; // trail 1, sigil 2, legend 3

export function shineOf(copy: CardCopy): number;
export function squadShine(copies: CardCopy[]): number;
export function squadMeets(tier: ExpeditionTierKey, copies: CardCopy[]): { ok: boolean; reasons: string[] };
export interface DailyBrief { key: string; label: string; role: string; bonus: number } // bonus 0.2
export function briefFor(dateIso: string): DailyBrief;   // deterministic per UTC date
export interface ExpeditionOutcome {
  grade: OutcomeGrade;
  dollars: number;
  comp: boolean;
  mark: ExpeditionMark | null;
  briefHit: boolean;
}
export function rollOutcome(
  tier: ExpeditionTierKey,
  shine: number,
  copies: Pick<CardCopy, "role">[],
  dateIso: string,
  rand: () => number,       // callers pass the CSPRNG (rng.ts discipline)
): ExpeditionOutcome;
```

- [ ] **Step 1: Write the failing tests**

`src/lib/expeditions/config.test.ts` (plain Vitest, no mocks — the module is pure). Cover at minimum:

```ts
import { describe, expect, it } from "vitest";
import { briefFor, EXPEDITION_TIERS, rollOutcome, shineOf, squadMeets } from "./config";

const copy = (over: Partial<Parameters<typeof shineOf>[0]>) => ({
  id: 1, tier: "gold", foil: false, foilType: null, signed: false, role: "MID",
  card: {}, ...over,
}) as Parameters<typeof shineOf>[0];

describe("shineOf", () => {
  it("scores tier base by ladder index", () => {
    expect(shineOf(copy({ tier: "bronze" }))).toBe(1);
    expect(shineOf(copy({ tier: "challenger" }))).toBe(8);
  });
  it("adds parallel and signature bonuses", () => {
    expect(shineOf(copy({ tier: "gold", foil: true, foilType: "ice" }))).toBe(3 + 4);
    expect(shineOf(copy({ tier: "gold", signed: true }))).toBe(3 + 4);
    expect(shineOf(copy({ tier: "gold", foil: true, foilType: "prisma", signed: true }))).toBe(3 + 1 + 4);
  });
  it("scores relics and moments flat 6", () => {
    expect(shineOf(copy({ card: { champWin: {} } }))).toBe(6);
    expect(shineOf(copy({ card: { moment: {} } }))).toBe(6);
  });
});

describe("squadMeets", () => {
  it("legend needs 2 foils, 1 signed, shine 20", () => {
    const squad = [
      copy({ tier: "diamond", foil: true, foilType: "ice" }),      // 6+4 = 10
      copy({ tier: "master", foil: true, foilType: "refractor" }), // 7+3 = 10
      copy({ tier: "gold", signed: true }),                        // 3+4 = 7
    ];
    expect(squadMeets("legend", squad).ok).toBe(true);
  });
  it("reports every unmet requirement by name", () => {
    const { ok, reasons } = squadMeets("legend", [copy({}), copy({}), copy({})]);
    expect(ok).toBe(false);
    expect(reasons.join(" ")).toMatch(/foil/i);
    expect(reasons.join(" ")).toMatch(/signed/i);
    expect(reasons.join(" ")).toMatch(/shine/i);
  });
  it("rejects squads that are not exactly three", () => {
    expect(squadMeets("scout", [copy({}), copy({})]).ok).toBe(false);
  });
});

describe("briefFor", () => {
  it("is deterministic per date and varies across dates", () => {
    expect(briefFor("2026-08-27")).toEqual(briefFor("2026-08-27"));
    const keys = new Set(["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"].map((d) => briefFor(d).key));
    expect(keys.size).toBeGreaterThan(1);
  });
});

describe("rollOutcome", () => {
  it("never pays below the tier floor and never marks above the tier ceiling", () => {
    for (let i = 0; i < 200; i += 1) {
      const out = rollOutcome("scout", 6, [{ role: "MID" }, { role: "TOP" }, { role: "BOT" }], "2026-08-27", Math.random);
      expect(out.dollars).toBeGreaterThan(0);
      expect(out.mark === null || out.mark === "trail").toBe(true);
      expect(out.comp).toBe(false); // scout never comps
    }
  });
  it("legend jackpot carries the legend mark", () => {
    const out = rollOutcome("legend", 30, [{ role: "MID" }, { role: "TOP" }, { role: "BOT" }], "2026-08-27", () => 0.999);
    // rand pinned high → jackpot branch (implement so the top of the range is jackpot)
    expect(out.grade).toBe("jackpot");
    expect(out.mark).toBe("legend");
  });
  it("applies the brief bonus when the squad satisfies it", () => {
    const brief = briefFor("2026-08-27");
    const withRole = rollOutcome("raid", 15, [{ role: brief.role }, { role: "X" }, { role: "X" }], "2026-08-27", () => 0.5);
    const without = rollOutcome("raid", 15, [{ role: "X" }, { role: "X" }, { role: "X" }], "2026-08-27", () => 0.5);
    expect(withRole.briefHit).toBe(true);
    expect(withRole.dollars).toBeGreaterThan(without.dollars);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/expeditions --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Implementation notes (the file carries a header comment in the style of `packs/config.ts` — "every number lives here so a balance pass is a one-file change"):

- Tier ladder: `const TIER_LADDER = ["bronze","silver","gold","platinum","emerald","diamond","master","challenger"]` — mirrors `TIERS` in `src/lib/cards/build.ts:219` (say so in a comment; do not import the scoring table, it is not exported).
- `shineOf`: `card.champWin || card.moment` → 6; else ladder index + 1, `+ {prisma:1, aurora:2, refractor:3, ice:4}[foilTypeOf(copy.foilType)]` when `copy.foil`, `+ 4` when `copy.signed`.
- Rewards table (constants, tuned under `PACK_COST` — import it and add a comment asserting expected value stays below pack price so expeditions supplement the economy):
  - scout: weights poor .5 / solid .45 / jackpot .05; dollars 15 / 40 / 90; comp never; mark: jackpot → 8% trail.
  - raid: weights .35 / .5 / .15; dollars 40 / 90 / 180; comp: jackpot → 25%; mark: solid → 10% sigil, jackpot → 30% sigil.
  - legend: weights .25 / .5 / .25; dollars 90 / 180 / 400; comp: solid → 15%, jackpot → 60%; mark: jackpot → always `legend`.
- Shine bonus: `dollars = round(base * (1 + min(0.5, 0.03 * max(0, shine - minShine))) * (briefHit ? 1 + brief.bonus : 1))`.
- `briefFor`: 6 entries (one per role in the league's role vocabulary — read the distinct `role` values used in `card_inventory`/`CardCopy`; check `src/lib/cards/build.ts` for the canonical role strings and use those exactly). Index = simple char-code hash of the date string mod entries.
- `rollOutcome` consumes `rand()` once for grade (cumulative weights, top of range = jackpot so the pinned-high test holds), once for comp, once for mark — conditional consumption in that fixed order (the `rng.ts` discipline; comment it).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/expeditions --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/expeditions/config.ts src/lib/expeditions/config.test.ts
git commit -m "feat: expedition config — shine, tiers, briefs, outcome rolls"
```

---

### Task 2: Migration — `expedition_runs`, launch/claim RPCs, deploy-lock trigger, pgTAP

**Files:**
- Create: `supabase/migrations/20260901000001_card_expeditions.sql`
- Test: `supabase/tests/0069_card_expeditions_test.sql`

**Interfaces:**
- Produces: table `public.expedition_runs (id bigint identity pk, discord_id text, season text, tier text, squad bigint[], shine int, started_at timestamptz, resolves_at timestamptz, outcome jsonb, claimed_at timestamptz)` — owner-only select via RLS, service-role writes.
- Produces: `public.launch_expedition(p_user text, p_season text, p_tier text, p_squad bigint[], p_shine int, p_hours int) returns table(run_id bigint, resolves_at timestamptz)`.
- Produces: `public.claim_expedition(p_user text, p_run bigint, p_grade text, p_dollars bigint, p_comp boolean, p_mark text, p_bearer bigint) returns table(balance bigint)` — mark may be null; bearer must be in the squad when mark is not null.
- Produces: trigger `card_inventory_expedition_guard` refusing DELETE or `discord_id` UPDATE on copies in an unclaimed run (error text `card is on expedition`).
- Later tasks rely on: ledger `reason = 'expedition'`; comp `kind = 'standard'`; mark json path `card -> 'expedition'` = `{"mark": ..., "tier": ..., "date": ...}`.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/0069_card_expeditions_test.sql` — fixture like 0068's (auth user, betting profile with `patron_until` null, three `card_inventory` rows with ids captured into psql variables via `returning` into a temp table). Assert (~20 tests):

- launch happy path returns a run with `resolves_at ≈ now() + 8h`;
- launch with a copy the user doesn't own raises (`throws_ok`, message `card not owned`);
- launch with a copy already in an unclaimed run raises `card already deployed`;
- second launch the same Eastern day raises `daily expedition limit`; after `update betting_profiles set patron_until = now() + interval '30 days'`, a second launch succeeds (patron slot);
- squads must be exactly 3 distinct ids (`throws_ok` on 2 ids and on duplicates);
- `dust_card` on a deployed copy raises `card is on expedition` (call the existing RPC directly);
- direct `delete from card_inventory` on a deployed copy raises the same (trigger, not RPC, is the guard);
- claim before `resolves_at` raises `expedition still out`;
- after `update expedition_runs set resolves_at = now() - interval '1 minute'`: claim pays (`betting_ledger` row reason `expedition`, balance credited), stamps the bearer's `card -> 'expedition' ->> 'mark'`, sets `claimed_at`;
- claim again raises `already claimed`;
- claim with `p_bearer` not in the squad raises `bearer not in squad`;
- mark replace-only-upward: seed a copy whose json already holds `{"expedition":{"mark":"legend"}}`, claim with `p_mark = 'sigil'` targeting it → json still says `legend` (the RPC keeps the higher mark silently; dollars still pay);
- RLS: as the owner's authenticated role, `select` sees own runs; `set local role anon` sees none (`is_empty`); anon insert throws `42501`;
- after claim, the copy can be dusted again (`lives_ok` on `dust_card`).

Set `request.jwt.claims` / use the same role-switching helpers the existing tests use — read `supabase/tests/helpers/` and a recent RLS test (0061_banger_vote_service_role_test.sql) and copy their mechanism exactly.

- [ ] **Step 2: Run to verify failure**

Run: `npx supabase test db`
Expected: 0069 fails — table missing.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260901000001_card_expeditions.sql`. Full content:

```sql
-- Card Expeditions — deploy a squad of three copies, come back with loot.
--
-- The app (trusted server code) computes shine, entry requirements, and
-- outcome rolls from src/lib/expeditions/config.ts — one tunable file,
-- the packs/config.ts pattern. These RPCs are the atomicity and the law:
-- ownership, no-double-deploy, the daily limit, the payout ledger, and
-- the mark stamp all happen in one transaction here, and the trigger
-- below is the guarantee no deployed copy leaves the collection.
-- Spec: docs/superpowers/specs/2026-08-27-card-expeditions-design.md.

create table public.expedition_runs (
  id          bigint generated always as identity primary key,
  discord_id  text not null references public.betting_profiles(discord_id),
  season      text not null,
  tier        text not null check (tier in ('scout', 'raid', 'legend')),
  squad       bigint[] not null check (array_length(squad, 1) = 3),
  shine       int not null,
  started_at  timestamptz not null default now(),
  resolves_at timestamptz not null,
  outcome     jsonb,
  claimed_at  timestamptz
);

create index expedition_runs_owner_idx on public.expedition_runs (discord_id, season, claimed_at);
-- The deploy-lock lookups scan unclaimed runs' squads.
create index expedition_runs_active_squad_idx on public.expedition_runs using gin (squad) where claimed_at is null;

alter table public.expedition_runs enable row level security;

-- Owners see their own runs (the page reads with the user's own client);
-- every write goes through the RPCs.
create policy expedition_runs_owner_read on public.expedition_runs
  for select using (
    discord_id in (
      select p.discord_id from public.profiles p where p.id = auth.uid()
    )
  );

grant select on public.expedition_runs to authenticated;
grant all on public.expedition_runs to service_role;

-- === deploy lock =============================================================
-- A copy in an unclaimed run cannot leave the collection: not by melt
-- (dust_card deletes the row) and not by trade (ownership update). The
-- trigger is the guarantee; UI checks are courtesy.

create or replace function public.expedition_guard()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.expedition_runs r
    where r.claimed_at is null and old.id = any(r.squad)
  ) then
    raise exception 'card is on expedition';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger card_inventory_expedition_guard
  before delete or update of discord_id on public.card_inventory
  for each row execute function public.expedition_guard();

-- === launch_expedition =======================================================

create or replace function public.launch_expedition(
  p_user text, p_season text, p_tier text, p_squad bigint[], p_shine int, p_hours int
) returns table(run_id bigint, resolves_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'America/New_York')::date;
  v_patron  boolean;
  v_limit   int;
  v_used    int;
  v_owned   int;
  v_run_id  bigint;
  v_resolves timestamptz;
begin
  if p_tier not in ('scout', 'raid', 'legend') then raise exception 'unknown tier'; end if;
  if p_hours not between 1 and 96 then raise exception 'bad duration'; end if;
  if array_length(p_squad, 1) is distinct from 3
     or (select count(distinct s) from unnest(p_squad) s) <> 3 then
    raise exception 'squad must be three distinct cards';
  end if;

  -- Wallet lock serializes the daily-limit check (open_daily_pack pattern).
  select patron_until > now() into v_patron
    from betting_profiles where betting_profiles.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  v_limit := case when coalesce(v_patron, false) then 2 else 1 end;
  select count(*) into v_used from expedition_runs r
    where r.discord_id = p_user
      and (r.started_at at time zone 'America/New_York')::date = v_today;
  if v_used >= v_limit then raise exception 'daily expedition limit'; end if;

  select count(*) into v_owned from card_inventory ci
    where ci.id = any(p_squad) and ci.discord_id = p_user;
  if v_owned <> 3 then raise exception 'card not owned'; end if;

  if exists (
    select 1 from expedition_runs r
    where r.claimed_at is null and r.squad && p_squad
  ) then
    raise exception 'card already deployed';
  end if;

  v_resolves := now() + make_interval(hours => p_hours);
  insert into expedition_runs (discord_id, season, tier, squad, shine, resolves_at)
  values (p_user, p_season, p_tier, p_squad, p_shine, v_resolves)
  returning id into v_run_id;

  return query select v_run_id, v_resolves;
end;
$$;

revoke all on function public.launch_expedition(text, text, text, bigint[], int, int) from public, anon, authenticated;
grant execute on function public.launch_expedition(text, text, text, bigint[], int, int) to service_role;

-- === claim_expedition ========================================================
-- The app rolls the outcome (CSPRNG, server-only) and this writes it once.
-- claimed_at is the reroll lock: a second claim of the same run fails, so
-- an outcome can never be shopped for. p_dollars is guarded like
-- open_card_pack's p_cost — service code passes config truth.

create or replace function public.claim_expedition(
  p_user text, p_run bigint, p_grade text, p_dollars bigint, p_comp boolean, p_mark text, p_bearer bigint
) returns table(balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run     expedition_runs%rowtype;
  v_current text;
  v_rank    int;
  v_new_rank int;
  v_balance bigint;
begin
  if p_grade not in ('poor', 'solid', 'jackpot') then raise exception 'unknown grade'; end if;
  if p_dollars not between 1 and 2000 then raise exception 'payout out of range'; end if;
  if p_mark is not null and p_mark not in ('trail', 'sigil', 'legend') then raise exception 'unknown mark'; end if;

  select * into v_run from expedition_runs r
    where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if v_run.resolves_at > now() then raise exception 'expedition still out'; end if;

  if p_mark is not null then
    if p_bearer is null or not (p_bearer = any(v_run.squad)) then
      raise exception 'bearer not in squad';
    end if;
    -- Replace only upward: trail(1) < sigil(2) < legend(3). An equal or
    -- lower roll keeps the copy's existing mark; the dollars still pay.
    select ci.card -> 'expedition' ->> 'mark' into v_current
      from card_inventory ci where ci.id = p_bearer;
    v_rank := case v_current when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 else 0 end;
    v_new_rank := case p_mark when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 end;
    if v_new_rank > v_rank then
      update card_inventory
        set card = jsonb_set(card, '{expedition}', jsonb_build_object(
          'mark', p_mark, 'tier', v_run.tier, 'date', to_char(now() at time zone 'utc', 'YYYY-MM-DD')))
        where id = p_bearer;
    end if;
  end if;

  update expedition_runs
    set outcome = jsonb_build_object('grade', p_grade, 'dollars', p_dollars, 'comp', p_comp,
                                     'mark', p_mark, 'bearer', p_bearer),
        claimed_at = now()
    where id = p_run;

  insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
  values (p_user, p_dollars, 'expedition', 'expedition_runs', p_run);
  update betting_profiles set balance = betting_profiles.balance + p_dollars
    where betting_profiles.discord_id = p_user
    returning betting_profiles.balance into v_balance;

  if p_comp then
    insert into card_pack_comps (discord_id, kind, remaining, granted, reason)
    values (p_user, 'standard', 1, 1, 'expedition run ' || p_run)
    on conflict (discord_id, kind)
    do update set remaining = card_pack_comps.remaining + 1,
                  granted   = card_pack_comps.granted + 1;
  end if;

  return query select v_balance;
end;
$$;

revoke all on function public.claim_expedition(text, bigint, text, bigint, boolean, text, bigint) from public, anon, authenticated;
grant execute on function public.claim_expedition(text, bigint, text, bigint, boolean, text, bigint) to service_role;
```

Before writing, check how `expedition_runs_owner_read`'s profiles↔discord_id join should actually read in this schema: `profiles` has `discord_id` (`src` fixture showed it) — confirm the exact linking column the existing owner-read policies use (`grep -rn "auth.uid()" supabase/migrations/*.sql | grep -i discord` and copy the established join).

- [ ] **Step 4: Apply and test**

Run: `npx supabase migration up && npx supabase test db`
Expected: 0069 passes; 0068 and the rest stay green (especially the trading/dust suites — the new trigger must not break their fixtures; if a trading test melts a deployed... none exist yet, so green).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901000001_card_expeditions.sql supabase/tests/0069_card_expeditions_test.sql
git commit -m "feat: expedition runs — launch/claim RPCs and the deploy lock"
```

---

### Task 3: Marks render — `expedition` on the card type and the three treatments

**Files:**
- Modify: `src/lib/cards/build.ts:132` (`PlayerCardData`)
- Create: `src/components/cards/ExpeditionMark.tsx`
- Modify: `src/app/globals.css` (three utilities; follow the `@utility` pattern at `globals.css:644+`)
- Modify: `src/components/cards/PlayerCard3D.tsx`, `src/components/cards/ChampionsCard.tsx` (render lines, same three integration points as `DrawLaurel` from the weekly-draw work — read how it landed and mirror it)
- Test: `src/components/cards/ExpeditionMark.test.tsx`

**Interfaces:**
- Consumes: `card.expedition` json written by Task 2's claim RPC.
- Produces: `PlayerCardData.expedition?: { mark: "trail" | "sigil" | "legend"; tier: string; date: string } | null`; `<ExpeditionMark mark={...} date={...} />` server-safe.

- [ ] **Step 1: Add the type field**

```ts
  /** Set on a copy that came back marked from an expedition — cosmetic
   *  provenance only, never read by dust pricing. Replaceable only
   *  upward (trail < sigil < legend); see lib/expeditions/config.ts. */
  expedition?: { mark: "trail" | "sigil" | "legend"; tier: string; date: string } | null;
```

- [ ] **Step 2: Write the failing component test**

```tsx
import { render, screen } from "@testing-library/react";
import ExpeditionMark from "./ExpeditionMark";

it.each(["trail", "sigil", "legend"] as const)("renders the %s mark with provenance", (mark) => {
  render(<ExpeditionMark mark={mark} date="2026-09-01" />);
  const el = screen.getByLabelText(/expedition/i);
  expect(el).toBeInTheDocument();
  expect(el.getAttribute("title")).toContain("2026-09-01");
});

it("legend renders the gilded ember frame layer", () => {
  const { container } = render(<ExpeditionMark mark="legend" date="2026-09-01" />);
  expect(container.querySelector(".legend-embers")).not.toBeNull();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/components/cards/ExpeditionMark --reporter=dot`
Expected: FAIL.

- [ ] **Step 4: Build the component and CSS**

`ExpeditionMark.tsx` — one component, three treatments, all layers (no hooks):

- **trail**: a small compass roundel, bottom-right by the serial rail — an SVG circle with a needle path, steel-grey stroke (`#8d8388`), ~`h-6 w-6`, `absolute bottom-[9%] right-[6%]`.
- **sigil**: the compass roundel upgraded to engraved gold (`#e8c14b` stroke, subtle `drop-shadow`) plus two weathered corner accents: `span`s at the card's top-right and bottom-left inside edges, 1px bronze borders with a worn gradient (`linear-gradient(135deg, rgb(176 141 87 / 0.5), transparent 60%)`), ~2.5rem long.
- **legend**: the sigil treatment plus the gilded ember frame — a full-face `span.legend-embers` layer.

`globals.css` additions, following `champ-embers`' structure exactly (it's at `globals.css:717+` — same pseudo-element two-layer parallax, same keyframes reuse) but with gold paints and an edge mask so the embers hug the frame instead of the face:

```css
/* The Legend Finish: expedition gold burning at the card's edges. The
   champ-embers technique with gilded paints, masked to a frame band so
   the card face stays legible — the mark is a frame, not a veil. */
@utility legend-embers {
  pointer-events: none;
  overflow: hidden;
  mix-blend-mode: screen;
  -webkit-mask-image: linear-gradient(to right, #000 8%, transparent 20%, transparent 80%, #000 92%),
    linear-gradient(to bottom, #000 8%, transparent 20%, transparent 80%, #000 92%);
  mask-image: linear-gradient(to right, #000 8%, transparent 20%, transparent 80%, #000 92%),
    linear-gradient(to bottom, #000 8%, transparent 20%, transparent 80%, #000 92%);
  -webkit-mask-composite: source-over;
}
.legend-embers::before,
.legend-embers::after {
  content: "";
  position: absolute;
  inset: 0;
  background-repeat: repeat;
}
.legend-embers::before {
  background-image:
    radial-gradient(circle 2.2px at 18% 12%, rgb(255 243 196 / 0.95), rgb(232 193 75 / 0.5) 55%, transparent 100%),
    radial-gradient(circle 1.7px at 72% 26%, rgb(240 185 60 / 0.9), transparent 100%),
    radial-gradient(circle 2px at 44% 47%, rgb(255 231 160 / 0.9), rgb(232 193 75 / 0.4) 60%, transparent 100%),
    radial-gradient(circle 1.5px at 88% 62%, rgb(232 193 75 / 0.85), transparent 100%),
    radial-gradient(circle 2.1px at 8% 74%, rgb(255 243 196 / 0.9), transparent 100%),
    radial-gradient(circle 1.6px at 58% 88%, rgb(240 185 60 / 0.85), transparent 100%);
  background-size: 160px 340px;
  animation: champ-ember-rise-a 11s linear infinite;
  opacity: 0.85;
}
.legend-embers::after {
  background-image:
    radial-gradient(circle 1.2px at 30% 8%, rgb(255 231 160 / 0.8), transparent 100%),
    radial-gradient(circle 1px at 80% 32%, rgb(232 193 75 / 0.75), transparent 100%),
    radial-gradient(circle 1.3px at 12% 44%, rgb(255 243 196 / 0.75), transparent 100%),
    radial-gradient(circle 1px at 52% 64%, rgb(240 185 60 / 0.7), transparent 100%),
    radial-gradient(circle 1.1px at 92% 82%, rgb(232 193 75 / 0.7), transparent 100%),
    radial-gradient(circle 1px at 38% 94%, rgb(255 231 160 / 0.7), transparent 100%);
  background-size: 120px 250px;
  animation: champ-ember-rise-b 7s linear infinite;
  opacity: 0.6;
}
```

(Reuses the existing `champ-ember-rise-a/b` keyframes — do not redeclare them. Honor the existing `prefers-reduced-motion` block: add `.legend-embers::before, .legend-embers::after` to it, next to the champ-embers entries at `globals.css:766`.)

Integrate at the same three points `DrawLaurel` integrated, guarded on `card.expedition`. The laurel sits bottom-left, the mark roundel bottom-right — no collision; say so in a comment.

- [ ] **Step 5: Run tests, eyeball in the app**

Run: `npx vitest run src/components/cards --reporter=dot` → PASS.
Then `npm run dev`, stamp a local copy by hand (`update card_inventory set card = jsonb_set(card, '{expedition}', '{"mark":"legend","tier":"legend","date":"2026-09-01"}') where id = <some id>;` via `npx supabase db psql` or the Studio SQL editor) and confirm the gilded frame burns on the shelf without drowning the face.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cards/build.ts src/components/cards/ExpeditionMark.tsx src/components/cards/ExpeditionMark.test.tsx src/app/globals.css src/components/cards/PlayerCard3D.tsx src/components/cards/ChampionsCard.tsx
git commit -m "feat: expedition marks render — trail, sigil, legend finish"
```

---

### Task 4: Server actions and queries

**Files:**
- Create: `src/lib/expeditions/actions.ts` (`"use server"`), `src/lib/expeditions/runs.ts` (`server-only` logic), `src/lib/expeditions/queries.ts`
- Test: `src/lib/expeditions/runs.test.ts`, `src/lib/expeditions/queries.test.ts`

**Interfaces:**
- Consumes: Task 1's config; Task 2's RPCs; `getBettingUser` from `src/lib/betting/wallet`; `createBettingServiceClient` from `src/lib/betting/service-client`; `postCardsWebhook`/`GOLD` from `src/lib/packs/announce`; the copies query from `src/lib/packs/queries.ts` (fetch by ids).
- Produces:

```ts
// actions.ts ("use server" — session-gated wrappers ONLY, packs/actions.ts pattern)
export async function launchExpeditionAction(tier: ExpeditionTierKey, squadIds: number[]):
  Promise<{ ok: true; runId: number; resolvesAt: string } | { ok: false; error: string }>;
export async function claimExpeditionAction(runId: number):
  Promise<{ ok: true; outcome: ExpeditionOutcome; bearerId: number | null; balance: number } | { ok: false; error: string }>;

// runs.ts (server-only, takes a bare discordId on trust AFTER the action authenticated)
export async function launchExpeditionFor(discordId: string, tier: ExpeditionTierKey, squadIds: number[]): ...
export async function claimExpeditionFor(discordId: string, runId: number): ...

// queries.ts
export interface ExpeditionRun { id: number; tier: ExpeditionTierKey; squad: number[]; shine: number;
  startedAt: string; resolvesAt: string; outcome: ExpeditionOutcome | null; claimedAt: string | null }
export async function fetchRuns(supabase, discordId, season): Promise<ExpeditionRun[]>;
export async function fetchDeployedCopyIds(supabase, discordId): Promise<Set<number>>;
```

- [ ] **Step 1: Write the failing tests**

Mock the service client the way `src/lib/packs/chase.test.ts` does (read it first; reuse its helper). Cover in `runs.test.ts`:
- `launchExpeditionFor` fetches the three copies, refuses (typed error, no RPC call) when `squadMeets` fails, computes shine via `squadShine`, calls `launch_expedition` with `p_hours` from the tier def, maps the RPC's `raise exception` texts to friendly copy (`card already deployed` → "One of those cards is already out on an expedition." — the `friendlyOpenPackError` pattern; write the mapper as an exported pure function `friendlyExpeditionError(message: string): string` and test each mapping);
- `claimExpeditionFor` reads the run, refuses when unresolved (before calling the RPC — but the RPC re-checks; both tested), rolls via `rollOutcome` with `randomBytes`-based rand (the `open.ts` CSPRNG line: `() => randomBytes(6).readUIntBE(0, 6) / 2 ** 48`), picks the bearer uniformly from the squad when a mark rolled, calls `claim_expedition`, posts the webhook only on `tier === "legend" && grade === "jackpot"` (assert the mock was/wasn't called).

`queries.test.ts`: row mapping snake→camel, `fetchDeployedCopyIds` unions `squad` arrays of unclaimed runs only.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/expeditions --reporter=dot` → new files FAIL.

- [ ] **Step 3: Implement**

`actions.ts` is thin: `getBettingUser()`, refuse signed-out (`"Sign in with Discord to use the betting site."`) and `!user.allowed` (`"FPL Better members only."` — copy `packs/actions.ts` verbatim), delegate to `runs.ts`, `revalidatePath("/cards/expeditions")`. `runs.ts` carries the logic; season comes from the same helper `openPackFor` uses (`fetchCardSeason` — check its import in `open.ts` and reuse). Announcement embed for the legend jackpot:

```ts
await postCardsWebhook({
  title: "Legend Hunt — jackpot",
  description: `<@${discordId}>'s Legend Hunt struck gold: ${outcome.dollars} dollars${outcome.comp ? ", a free pack" : ""}${outcome.mark ? ", and a card came back wearing the Legend Finish" : ""}.`,
  color: GOLD,
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/expeditions --reporter=dot` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/expeditions
git commit -m "feat: expedition launch/claim actions and queries"
```

---

### Task 5: The page — squad picker, active runs, claim ceremony

**Files:**
- Create: `src/app/cards/expeditions/page.tsx` (server), `src/components/cards/ExpeditionBoard.tsx` (client)
- Modify: `src/components/cards/CardsNav.tsx` (Economy group entry: `{ label: "Expeditions", href: `${base}/expeditions`, blurb: "Send three cards out; they come back changed" }`)
- Test: `src/components/cards/ExpeditionBoard.test.tsx`

**Interfaces:**
- Consumes: Task 4's actions/queries; `CardCopy` + the collection fetch from `src/lib/packs/queries.ts` (however `/cards/packs` loads the user's copies — read that page and reuse); `shineOf`, `squadMeets`, `briefFor`, `EXPEDITION_TIERS` from config; `PlayerCard3D` or the smaller copy renderer the shelf uses (match the shelf).
- Produces: the `/cards/expeditions` route.

- [ ] **Step 1: Write the failing component test**

`ExpeditionBoard.test.tsx` (testing-library; mock the actions module with `vi.mock`). Cover: tier cards show entry requirements and disable with the exact unmet `reasons` from `squadMeets` when the current selection fails; selecting three copies shows squad shine as the sum of `shineOf`; a resolvable run (resolvesAt in the past) shows the Claim button; an unresolved run shows a countdown label, no button; today's brief renders its label.

- [ ] **Step 2: Run to verify failure, then build**

Board behavior:
- **Squad picker**: the user's copies in a grid (small renders), deployed ones (from `fetchDeployedCopyIds`) dimmed with an "on expedition" ribbon and unselectable; each copy chip shows its shine ("+7"); a running total and per-tier eligibility live-update on selection.
- **Tier cards**: the three tiers as the page's centerpiece, each with entry requirements, duration, and reward flavor text; the launch button carries the selection.
- **Active runs**: countdown (render `resolvesAt` relative; a simple `useEffect` interval ticking a `useState` clock is fine — no per-mousemove-style hand-DOM needed here), squad thumbnails, tier label.
- **Claim ceremony**: on claim resolve, show the outcome — dollars count up (reuse `CountUp` from `@/components/home/CountUp`, the `PlayerCard3D` import shows the path), and when a mark landed, the bearer's card rendered large with its new mark ("The expedition chose **{name}**"). Keep it one state machine in the Board, no new route.
- Today's brief banner: "{brief.label} — +20% yield".

Page (`page.tsx`): server component; signed-out → the same sign-in framing `/cards/packs` uses; fetch copies + runs server-side and hand to the Board.

- [ ] **Step 3: Deployed-copy guards in dust and trades UI**

- `DustControls.tsx`: accept a `deployedIds?: Set<number>` prop; deployed copies' melt button disabled with title "On expedition — back soon." Wire the prop where DustControls is rendered (find call sites: `grep -rn "DustControls" src/app src/components`).
- `TradeBuilder.tsx`: same prop, deployed copies unselectable. (The DB trigger already refuses; this is the courtesy layer. The trade *accept* path needs no UI change — the RPC surfaces the trigger's error; add the `card is on expedition` → friendly mapping to the existing error mapper in `src/lib/trades/actions.ts:88`.)

- [ ] **Step 4: Run tests + eyeball**

Run: `npx vitest run src/components/cards --reporter=dot` → PASS.
`npm run dev` → launch a Scouting Run with local demo copies end-to-end; shorten the wait by `update expedition_runs set resolves_at = now()` locally; claim and watch the ceremony.

- [ ] **Step 5: Commit**

```bash
git add src/app/cards/expeditions src/components/cards/ExpeditionBoard.tsx src/components/cards/ExpeditionBoard.test.tsx src/components/cards/CardsNav.tsx src/components/cards/DustControls.tsx src/components/cards/TradeBuilder.tsx src/lib/trades/actions.ts
git commit -m "feat: expeditions page — squad picker, runs, claim ceremony"
```

---

### Task 6: Docs and rollout

**Files:**
- Modify: `docs/backend.md` (Database organization row for `expedition_runs`; RPC families entry for `launch_expedition`/`claim_expedition`; a line in Common pitfalls about the deploy-lock trigger)
- Modify: `README.md` (a short Expeditions note in the feature/operations list)

- [ ] **Step 1: Write the doc updates.**
- [ ] **Step 2: Full checks** — `npm test && npx supabase test db && npm run lint`. Expected: green, including the pre-existing trading and dust suites against the new trigger.
- [ ] **Step 3: Commit**

```bash
git add docs/backend.md README.md
git commit -m "docs: expeditions schema, RPCs, and deploy-lock notes"
```

- [ ] **Step 4: Rollout checklist**
  - User pushes `20260901000001_card_expeditions.sql` to prod (`tyywoneobreracfnujdk`) via `npx supabase db push`; verify with `npx supabase migration list`.
  - Merge `card-expeditions` → `main` only after the push is verified.
  - First-day smoke: launch a Scouting Run in prod with a real account; verify the lock (try to melt a deployed copy), the countdown, and the claim payout in the ledger.
