# Weekly Draw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every card copy is a raffle ticket; once a week the site draws one exact print and its holder wins a pot of betting dollars plus a pack comp.

**Architecture:** One service-role RPC (`run_weekly_draw`) does the whole draw atomically — pick, freeze, stamp, pay, comp, record. A cron-run script triggers it weekly per season and posts to the cards Discord webhook; public pages read the history table. The winning copy's frozen `card` json gains a `drawWin` marker that renderers show as a laurel stamp.

**Tech Stack:** Next.js 16 App Router (READ `node_modules/next/dist/docs/` before writing any Next code — this Next has breaking changes), Supabase Postgres (RLS + security-definer RPCs), pgTAP, Vitest, GitHub Actions cron, tsx scripts.

**Spec:** `docs/superpowers/specs/2026-08-27-weekly-draw-design.md`

## Global Constraints

- Migrations are append-only; new file `supabase/migrations/20260831000001_weekly_draw.sql`; matching pgTAP in `supabase/tests/0068_weekly_draw_test.sql`.
- Uniform ticket weighting — one `card_inventory` row, one ticket. No weighting of any kind, ever (spec non-goal).
- Every dollar credit writes a `betting_ledger` row in the same transaction as the `betting_profiles.balance` update (house pattern, see `vote_daily_banger`).
- `weekly_draws` is public-read (anon + authenticated), service-role-write-only. No insert/update/delete policies at all.
- The draw is idempotent per `(season, week_start)` — reruns return the existing row and change nothing.
- Deploy ordering: the migration must be applied to production **before** the branch merges to main (Vercel auto-deploys main). The user runs `npx supabase db push` themselves (Claude's permission classifier blocks it); verify parity with `npx supabase migration list`.
- Work on branch `weekly-draw` off current `main`.
- UI copy tone: match the site's voice (see `/cards` pages) — declarative, a little theatrical, never corporate.

---

### Task 1: Migration — `weekly_draws` table + `run_weekly_draw` RPC, with pgTAP

**Files:**
- Create: `supabase/migrations/20260831000001_weekly_draw.sql`
- Test: `supabase/tests/0068_weekly_draw_test.sql`

**Interfaces:**
- Produces: table `public.weekly_draws (season text, week_start date, copy_id bigint, discord_id text, card jsonb, pot bigint, drawn_at timestamptz, primary key (season, week_start))`, public-read.
- Produces: RPC `public.run_weekly_draw(p_season text, p_week date, p_pot bigint) returns table(copy_id bigint, discord_id text, already boolean)` — service_role execute only. `already = true` means the draw for that week existed and nothing changed.
- Later tasks rely on: ledger `reason = 'weekly_draw'`; comp row `card_pack_comps (kind = 'standard')`; stamped copy json path `card -> 'drawWin' -> 'weekStart'`.

- [ ] **Step 1: Write the failing pgTAP test**

Model the fixture setup on `supabase/tests/0062_banger_daily_bonus_test.sql` (auth user → betting_profiles → domain rows). Write `supabase/tests/0068_weekly_draw_test.sql`:

```sql
begin;
set local search_path = public, extensions;
select plan(13);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000d4a1'::uuid, 'authenticated', 'authenticated',
        'draw-0068@example.test', '', now(), now(), now());

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('draw-winner-0068', '00000000-0000-0000-0000-00000000d4a1'::uuid, 'Draw Winner', 500);

-- One eligible ticket — the draw MUST pick it (uniform over a set of one).
insert into public.card_inventory (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('draw-winner-0068', 'S_TEST_DRAW', 'test-player', 'Test Player', 'MID',
        date '2026-08-24', 80, 'platinum', false, '{"slug":"test-player","name":"Test Player"}'::jsonb);

-- 1. Table exists and is empty for this season.
select is((select count(*) from public.weekly_draws where season = 'S_TEST_DRAW')::int, 0, 'no draws yet');

-- 2-4. Running the draw picks the only ticket, pays, records.
select results_eq(
  $$ select discord_id, already from public.run_weekly_draw('S_TEST_DRAW', date '2026-08-24', 250) $$,
  $$ values ('draw-winner-0068', false) $$,
  'draw picks the only ticket');
select is((select count(*) from public.weekly_draws where season = 'S_TEST_DRAW')::int, 1, 'one draw row');
select is((select pot from public.weekly_draws where season = 'S_TEST_DRAW' and week_start = date '2026-08-24'), 250::bigint, 'pot recorded');

-- 5. Ledger row written with the draw reason.
select is(
  (select count(*) from public.betting_ledger where discord_id = 'draw-winner-0068' and reason = 'weekly_draw')::int,
  1, 'ledger row written');

-- 6. Balance credited.
select is((select balance from public.betting_profiles where discord_id = 'draw-winner-0068'), 750::bigint, 'pot credited');

-- 7. Standard pack comp granted.
select is((select remaining from public.card_pack_comps where discord_id = 'draw-winner-0068' and kind = 'standard'), 1, 'comp granted');

-- 8. The copy is stamped.
select is(
  (select card -> 'drawWin' ->> 'weekStart' from public.card_inventory where discord_id = 'draw-winner-0068' and season = 'S_TEST_DRAW'),
  '2026-08-24', 'copy stamped with drawWin');

-- 9. Frozen snapshot in the draw row carries the stamp too.
select is(
  (select card -> 'drawWin' ->> 'weekStart' from public.weekly_draws where season = 'S_TEST_DRAW'),
  '2026-08-24', 'snapshot frozen with stamp');

-- 10. Rerun is a no-op that reports already = true.
select results_eq(
  $$ select discord_id, already from public.run_weekly_draw('S_TEST_DRAW', date '2026-08-24', 250) $$,
  $$ values ('draw-winner-0068', true) $$,
  'rerun reports already');
select is((select balance from public.betting_profiles where discord_id = 'draw-winner-0068'), 750::bigint, 'rerun does not pay twice');

-- 11-12. Anon can read history; anon cannot write.
set local role anon;
select lives_ok($$ select * from public.weekly_draws $$, 'anon reads draw history');
select throws_ok(
  $$ insert into public.weekly_draws (season, week_start, copy_id, discord_id, card, pot)
     values ('S_TEST_DRAW', date '2026-08-31', 1, 'x', '{}'::jsonb, 1) $$,
  '42501', null, 'anon cannot write draws');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the pgTAP suite to verify it fails**

Run: `npx supabase test db` (local Supabase must be running; `npx supabase start` if not — and run `npx supabase migration up` first so the pulled 2026-08-27..30 migrations are applied locally).
Expected: 0068 FAILS — `weekly_draws` does not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260831000001_weekly_draw.sql`:

```sql
-- The Weekly Draw — every card copy is a raffle ticket.
--
-- One draw per (season, week): pick a card_inventory row uniformly at
-- random, stamp the copy's frozen json with the win, freeze a snapshot
-- (post-stamp, so history shows the laurel), pay the pot through the
-- ledger, and grant one standard pack comp. Uniform per copy is the
-- whole game: commons count, whales just hold more tickets — see
-- docs/superpowers/specs/2026-08-27-weekly-draw-design.md.
--
-- copy_id deliberately has NO foreign key: the copy may be melted later
-- and the draw record must outlive it (the jsonb snapshot is the record).

create table public.weekly_draws (
  season     text not null,
  week_start date not null,
  copy_id    bigint not null,
  discord_id text not null,
  card       jsonb not null,
  pot        bigint not null,
  drawn_at   timestamptz not null default now(),
  primary key (season, week_start)
);

alter table public.weekly_draws enable row level security;

-- The history page renders signed-out, same reasoning as fantasy_lineups.
create policy weekly_draws_public_read on public.weekly_draws
  for select using (true);

grant select on public.weekly_draws to anon, authenticated;
grant all on public.weekly_draws to service_role;

-- === run_weekly_draw =========================================================
-- The whole draw in one transaction. Idempotent: a second call for the
-- same (season, week) returns the recorded winner with already = true and
-- changes nothing — the cron can rerun safely (detect-moments pattern).
-- order by random() is fine at league scale (thousands of rows).

create or replace function public.run_weekly_draw(p_season text, p_week date, p_pot bigint)
returns table(copy_id bigint, discord_id text, already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copy   record;
  v_card   jsonb;
begin
  if p_pot < 0 then raise exception 'negative pot'; end if;

  -- Serialize concurrent draws for the same week; the second caller sees
  -- the first's row after it commits (primary key makes the race a
  -- unique-violation at worst, which the exists-check turns into already).
  perform 1 from weekly_draws w
    where w.season = p_season and w.week_start = p_week;
  if found then
    return query select w.copy_id, w.discord_id, true
      from weekly_draws w
      where w.season = p_season and w.week_start = p_week;
    return;
  end if;

  select ci.id, ci.discord_id, ci.card into v_copy
    from card_inventory ci
    where ci.season = p_season
    order by random()
    limit 1;
  if v_copy.id is null then
    -- No cards minted in this season yet — nothing to draw. Not an error:
    -- the script runs for every season unconditionally.
    return;
  end if;

  -- Stamp the living copy, then freeze the stamped json as history.
  v_card := jsonb_set(v_copy.card, '{drawWin}', jsonb_build_object('weekStart', to_char(p_week, 'YYYY-MM-DD')));
  update card_inventory set card = v_card where id = v_copy.id;

  insert into weekly_draws (season, week_start, copy_id, discord_id, card, pot)
  values (p_season, p_week, v_copy.id, v_copy.discord_id, v_card, p_pot);

  -- Pay the pot: ledger row + balance, the vote_daily_banger pattern.
  insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
  values (v_copy.discord_id, p_pot, 'weekly_draw', 'weekly_draws', null);
  update betting_profiles set balance = balance + p_pot
    where betting_profiles.discord_id = v_copy.discord_id;

  -- One standard pack comp, on top of the dollars.
  insert into card_pack_comps (discord_id, kind, remaining, granted, reason)
  values (v_copy.discord_id, 'standard', 1, 1, 'weekly_draw ' || p_season || ' ' || p_week)
  on conflict (discord_id, kind)
  do update set remaining = card_pack_comps.remaining + 1,
                granted   = card_pack_comps.granted + 1;

  return query select v_copy.id, v_copy.discord_id, false;
end;
$$;

revoke all on function public.run_weekly_draw(text, date, bigint) from public, anon, authenticated;
grant execute on function public.run_weekly_draw(text, date, bigint) to service_role;
```

- [ ] **Step 4: Apply and run the pgTAP suite to verify it passes**

Run: `npx supabase migration up`, then `npx supabase test db`
Expected: 0068 passes 13/13; the rest of the suite stays green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260831000001_weekly_draw.sql supabase/tests/0068_weekly_draw_test.sql
git commit -m "feat: weekly draw table and RPC — one copy wins every week"
```

---

### Task 2: Standard pack comps honored by the shop open flow

The draw pays a `kind='standard'` comp, but `openPackFor` only knows how to charge. Mirror the champions comp branch so a held standard comp makes the next shop pack free.

**Files:**
- Modify: `src/lib/packs/open.ts` (the `openPackFor` charge step; read the whole function first — the champions comp CAS branch at ~`open.ts:462-482` and its refund at ~`:574-590` are the model)
- Test: `src/lib/packs/open.test.ts` if it exists, else create alongside existing packs tests (check `src/lib/packs/*.test.ts` naming)

**Interfaces:**
- Consumes: `card_pack_comps` rows with `kind = 'standard'` (Task 1 grants them).
- Produces: exported helpers in `open.ts` — `spendPackComp(service, discordId, kind): Promise<number | null>` (remaining after spend, or null when none held) and `refundPackComp(service, discordId, kind): Promise<void>` — and `openPackFor` consuming a standard comp before charging. `OpenPackResult` already carries optional `compsLeft`; populate it when a comp was used.

- [ ] **Step 1: Extract the CAS comp helpers**

The champions flow's compare-and-swap loop becomes a shared helper (DRY — the draw and expeditions will both grant comps):

```ts
/** Spend one comp by compare-and-swap (PostgREST can't decrement in
 *  place): read the count, update only if it still holds. A lost race
 *  retries once against the new count; two clicks can never spend one
 *  comp twice. Returns the remaining count after spending, or null when
 *  no comp was held. */
export async function spendPackComp(
  service: SupabaseClient,
  discordId: string,
  kind: string,
): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: compRow } = await service
      .from("card_pack_comps")
      .select("*")
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .maybeSingle();
    const held = (compRow as { remaining?: number } | null)?.remaining ?? 0;
    if (held <= 0) return null;
    const { data: spent } = await service
      .from("card_pack_comps")
      .update({ remaining: held - 1 })
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .eq("remaining", held)
      .select("remaining");
    if (spent && spent.length > 0) return held - 1;
  }
  return null;
}
```

`refundPackComp` is the same CAS shape adding 1 back (model the champions refund block). Rewire `openChampionsPack` to call these helpers with `kind: "champions"` — behavior identical, now shared.

- [ ] **Step 2: Write the failing test**

Follow the existing packs test style (see `src/lib/packs/chase.test.ts` for how the service client is mocked in this codebase — reuse its mocking approach exactly). Test: `spendPackComp` returns `held - 1` when a comp exists, `null` when none, and survives one lost CAS race; `openPackFor` with a standard comp held inserts a `card_pack_opens` row with `cost = 0` / skips the `open_card_pack` charge and reports `compsLeft`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/packs --reporter=dot`
Expected: new tests FAIL (helpers not exported / branch absent).

- [ ] **Step 4: Wire the standard-comp branch into `openPackFor`**

In `openPackFor`, before the `open_card_pack` RPC call: `const compRemaining = await spendPackComp(service, discordId, "standard")`. When `compRemaining !== null`, skip the charge RPC (the champions branch's exact pattern — `openId` stays null, inventory rows insert with `pack_open_id: null`) and thread `compsLeft: compRemaining` into the result. On any failure after the spend, `refundPackComp` (mirror the champions refund placement).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/packs --reporter=dot`
Expected: PASS, including the pre-existing champions comp tests (the helper extraction must not change their behavior).

- [ ] **Step 6: Commit**

```bash
git add src/lib/packs/open.ts src/lib/packs/*.test.ts
git commit -m "feat: standard pack comps spend in the shop open flow"
```

---

### Task 3: The laurel — `drawWin` on the card type and renderers

**Files:**
- Modify: `src/lib/cards/build.ts:132` (the `PlayerCardData` interface)
- Create: `src/components/cards/DrawLaurel.tsx`
- Modify: `src/components/cards/PlayerCard3D.tsx` (the `PlayerCardFace` shell), `src/components/cards/ChampionsCard.tsx`, `src/components/cards/MomentPlate.tsx` — one render line each
- Test: `src/components/cards/DrawLaurel.test.tsx`

**Interfaces:**
- Consumes: `card.drawWin.weekStart` written by Task 1's RPC.
- Produces: `PlayerCardData.drawWin?: { weekStart: string } | null`; `<DrawLaurel weekStart={...} />` — server-safe (no hooks, no handlers, like `PatronFlame`).

- [ ] **Step 1: Add the field to the type**

In `PlayerCardData` (`src/lib/cards/build.ts:132`), beside `moment`/`champWin`:

```ts
  /** Set on a copy that won a Weekly Draw — cosmetic provenance only;
   *  dust pricing never reads it. weekStart is the drawn week's Monday. */
  drawWin?: { weekStart: string } | null;
```

- [ ] **Step 2: Write the failing component test**

Follow the style of an existing card component test (e.g. `src/components/cards/TiltHint.test.tsx`) — Vitest + testing-library:

```tsx
import { render, screen } from "@testing-library/react";
import DrawLaurel from "./DrawLaurel";

it("renders the laurel with the week in its label", () => {
  render(<DrawLaurel weekStart="2026-08-24" />);
  const laurel = screen.getByLabelText(/weekly draw winner/i);
  expect(laurel).toBeInTheDocument();
  expect(laurel.getAttribute("title")).toContain("2026-08-24");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/components/cards/DrawLaurel --reporter=dot`
Expected: FAIL — module not found.

- [ ] **Step 4: Build the component and integrate**

`src/components/cards/DrawLaurel.tsx` — a small gold laurel roundel, server-safe:

```tsx
// The Weekly Draw's laurel — permanent provenance on a copy that won.
// A layer like PatronFlame, not a frame swap: gold roundel, bottom-left,
// clear of every renderer's corner indices and footer rails.

export default function DrawLaurel({ weekStart }: { weekStart: string }) {
  return (
    <span
      aria-label="Weekly Draw winner"
      title={`Won the Weekly Draw — week of ${weekStart}`}
      className="absolute bottom-[9%] left-[6%] grid h-7 w-7 place-content-center rounded-full border border-[#e8c14b]/80 bg-black/70"
      style={{ boxShadow: "0 0 10px rgb(232 193 75 / 0.45)" }}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path d="M5 3 C5 12 9 16 12 17 C15 16 19 12 19 3 C16 5 14 5 12 4 C10 5 8 5 5 3 Z"
              fill="none" stroke="#e8c14b" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="12" cy="20" r="1.4" fill="#e8c14b" />
      </svg>
    </span>
  );
}
```

Integration — one guarded line in each renderer, inside the card's outermost positioned element:
- `PlayerCardFace` (in `PlayerCard3D.tsx`): `{props.card.drawWin ? <DrawLaurel weekStart={props.card.drawWin.weekStart} /> : null}`
- `ChampionsCard.tsx`: same, from its `card` prop, after the foil layer block.
- `MomentPlate.tsx`: the plate doesn't receive the full card json — thread `drawWin` through the moment branch in `PlayerCard3D.tsx` (which holds `props.card`) by rendering `<DrawLaurel>` next to the existing `PatronFlame` line there instead of inside `MomentPlate`.

- [ ] **Step 5: Run the component tests**

Run: `npx vitest run src/components/cards --reporter=dot`
Expected: PASS, nothing else broken.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cards/build.ts src/components/cards/DrawLaurel.tsx src/components/cards/DrawLaurel.test.tsx src/components/cards/PlayerCard3D.tsx src/components/cards/ChampionsCard.tsx
git commit -m "feat: draw-winner laurel renders on stamped copies"
```

---

### Task 4: Draw config, script, workflow, admin fallback

**Files:**
- Modify: `src/lib/packs/config.ts` (add `WEEKLY_DRAW_POT`)
- Create: `scripts/weekly-draw.ts`
- Create: `.github/workflows/weekly-draw.yml`
- Modify: `src/lib/packs/admin-actions.ts` (add `runWeeklyDrawAction`)
- Test: `scripts` have no test harness — the script is thin (compute week, loop seasons, call RPC, post webhook); its logic lives in tested code. `runWeeklyDrawAction` follows the existing admin-action test coverage pattern if one exists for `armChaseAction` (check `src/lib/packs/*.test.ts`; if admin actions are untested there, match the codebase and leave it to pgTAP + manual).

**Interfaces:**
- Consumes: `run_weekly_draw` RPC (Task 1); `postCardsWebhook(embed)` + `GOLD` from `src/lib/packs/announce.ts`; `fetchAllCardSeasons` from `src/lib/cards/queries`.
- Produces: `WEEKLY_DRAW_POT = 250` in `packs/config.ts`; `runWeeklyDrawAction(): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Add the pot to config**

In `src/lib/packs/config.ts`, beside the pack pricing constants:

```ts
/** The Weekly Draw pot, in betting dollars — paid with one standard pack
 *  comp on top. Sized against PACK_COST deliberately: winning feels real
 *  but never dwarfs playing the actual games. */
export const WEEKLY_DRAW_POT = 250;
```

- [ ] **Step 2: Write the script**

`scripts/weekly-draw.ts`, modeled on `scripts/weekly-card-drop.ts`'s header/env conventions (service client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; webhook optional):

```ts
/**
 * The Weekly Draw: one card copy per season wins the week. Calls the
 * run_weekly_draw RPC (idempotent — reruns are no-ops) for every card
 * season and posts each winner to the cards Discord webhook.
 *
 * Run: npx tsx scripts/weekly-draw.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; DISCORD_CARDS_WEBHOOK_URL
 * optional (draw still records without it). DRAW_WEEK (YYYY-MM-DD, a
 * Monday) overrides the default: the most recent completed week.
 *
 * Scheduled by .github/workflows/weekly-draw.yml Tuesdays after the card
 * drop, so the draw covers a finished week of pulls.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllCardSeasons } from "../src/lib/cards/queries";
import { WEEKLY_DRAW_POT } from "../src/lib/packs/config";
import { GOLD, postCardsWebhook } from "../src/lib/packs/announce";

/** Monday of the most recent COMPLETED Eastern week (the league's clock
 *  — matches the daily rip's America/New_York day convention). */
function lastCompletedWeekMonday(): string {
  const nowEt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = nowEt.getDay(); // 0 Sun..6 Sat
  const sinceMonday = (day + 6) % 7;
  const thisMonday = new Date(nowEt);
  thisMonday.setDate(nowEt.getDate() - sinceMonday);
  thisMonday.setDate(thisMonday.getDate() - 7);
  return thisMonday.toISOString().slice(0, 10);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const service = createClient(url, key);

  const week = process.env.DRAW_WEEK || lastCompletedWeekMonday();
  const seasons = await fetchAllCardSeasons(service);
  for (const season of seasons) {
    const { data, error } = await service.rpc("run_weekly_draw", {
      p_season: season,
      p_week: week,
      p_pot: WEEKLY_DRAW_POT,
    });
    if (error) throw new Error(`draw failed for ${season}: ${error.message}`);
    const row = (data as { copy_id: number; discord_id: string; already: boolean }[] | null)?.[0];
    if (!row) {
      console.log(`${season}: no cards yet, no draw`);
      continue;
    }
    console.log(`${season} week ${week}: winner ${row.discord_id}${row.already ? " (already drawn)" : ""}`);
    if (row.already) continue;

    const { data: drawRow } = await service
      .from("weekly_draws")
      .select("card, pot")
      .eq("season", season)
      .eq("week_start", week)
      .maybeSingle();
    const card = (drawRow as { card?: { name?: string } } | null)?.card;
    await postCardsWebhook({
      title: "The Weekly Draw",
      description: `**${card?.name ?? "A card"}** came up — held by <@${row.discord_id}>. ${WEEKLY_DRAW_POT} dollars and a free pack. One card wins every week — is it yours?`,
      color: GOLD,
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Check `fetchAllCardSeasons`' real signature in `src/lib/cards/queries.ts` before writing (weekly-card-drop.ts imports it — copy its usage exactly). Check `CardsEmbed`'s fields in `announce.ts:12` and match them.

- [ ] **Step 3: Write the workflow**

`.github/workflows/weekly-draw.yml`, the `detect-moments.yml` shape:

```yaml
name: Weekly card draw

on:
  schedule:
    # 15:30 UTC Tuesday — after the weekly card drop (15:00), so the
    # drawn week's story is complete when the winner posts.
    - cron: "30 15 * * 2"
  workflow_dispatch:
    inputs:
      week:
        description: "Monday of the week to draw (YYYY-MM-DD). Blank = last completed week."
        type: string
        default: ""

concurrency:
  group: weekly-draw
  cancel-in-progress: false

jobs:
  draw:
    runs-on: ubuntu-latest
    environment: Production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsx scripts/weekly-draw.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          DISCORD_CARDS_WEBHOOK_URL: ${{ secrets.DISCORD_CARDS_WEBHOOK_URL }}
          DRAW_WEEK: ${{ inputs.week }}
```

- [ ] **Step 4: Add the admin fallback action**

In `src/lib/packs/admin-actions.ts`, a `runWeeklyDrawAction` beside `armChaseAction`. **Copy the exact auth gate the existing actions in that file use** (read the file top-to-bottom first — the admin check and service-client acquisition must be identical), then: compute the week like the script does, loop seasons, call the RPC, `revalidatePath("/cards")`. Surface: add a "Run the draw" button in whatever admin panel renders `armChaseAction`'s control (find it: `grep -rn "armChaseAction" src/app src/components`) with the same styling as its neighbors.

- [ ] **Step 5: Typecheck and test the script compiles**

Run: `npx tsc --noEmit` and `npx vitest run src/lib/packs --reporter=dot`
Expected: clean typecheck; packs tests green.

- [ ] **Step 6: Commit**

```bash
git add scripts/weekly-draw.ts .github/workflows/weekly-draw.yml src/lib/packs/config.ts src/lib/packs/admin-actions.ts
git commit -m "feat: weekly draw script, cron workflow, admin fallback"
```

---

### Task 5: Surfaces — the Draw panel on /cards and the /cards/draw history page

**Files:**
- Create: `src/app/cards/draw/page.tsx`
- Create: `src/lib/cards/draw-queries.ts`
- Modify: `src/app/cards/page.tsx` (add the Draw panel section)
- Modify: `src/components/cards/CardsNav.tsx:41-43` (add the entry to the Economy group)
- Test: `src/lib/cards/draw-queries.test.ts`

**Interfaces:**
- Consumes: `weekly_draws` public reads; `card_inventory` counts via service client; `PlayerCard3D` for rendering frozen cards; `getBettingUser` from `src/lib/betting/wallet` for the signed-in ticket count.
- Produces: `fetchLatestDraw(supabase, season): Promise<DrawRow | null>` and `fetchDrawHistory(supabase, season): Promise<DrawRow[]>` and `fetchTicketCount(service, discordId, season): Promise<number>` where `DrawRow = { season: string; weekStart: string; discordId: string; card: PlayerCardData; pot: number; drawnAt: string }`.

- [ ] **Step 1: Write the failing query tests**

Model on `src/lib/cards/queries.test.ts`'s mocking style (read it first, reuse its supabase mock helper). Cover: row mapping (snake_case → the `DrawRow` shape, `card` json passed through untouched), empty history returns `[]`, ticket count returns the exact count.

Also extract the /cards panel's copy decisions into a pure tested helper here — `drawPanelState(latest: DrawRow | null, viewerDiscordId: string | null): { headline: string; isWinner: boolean }` covering the three states the spec names: no draws yet, winner is you, winner is someone else.

- [ ] **Step 2: Run to verify failure, then implement the queries**

Run: `npx vitest run src/lib/cards/draw-queries --reporter=dot` → FAIL, then implement `draw-queries.ts`: three thin functions over `.from("weekly_draws")` / `.from("card_inventory").select("id", { count: "exact", head: true })`. Match the query style of `src/lib/cards/queries.ts` (error → empty/0, never throw to the page).

- [ ] **Step 3: Build the history page**

`src/app/cards/draw/page.tsx` — server component, anon client (`createServerSupabase`), both leagues' draws (read how `/cards/packs/page.tsx` resolves the league/season pair and follow it). Layout: `label-dash` header "The Weekly Draw", the sentence of the game ("One card wins every week — is it yours?"), then a reverse-chronological grid: each entry renders `PlayerCard3D` from the frozen `card` json (`interactive` as the share page uses it), winner name, week, pot. Empty state: "No draws yet — the first winner is one Tuesday away."

- [ ] **Step 4: Add the /cards panel + nav entry**

- `CardsNav.tsx`: `{ label: "The Draw", href: `${base}/draw`, blurb: "One card wins every week" }` in the Economy group (after Trades).
- `/cards/page.tsx`: a compact Draw section — last winner's card (small render), pot for this week (`WEEKLY_DRAW_POT`), and when signed in (via `getBettingUser`), "You hold N tickets" from `fetchTicketCount` with the service client. Follow the page's existing section composition — read the file before touching it.

- [ ] **Step 5: Verify in the app**

Run: `npm run dev`; with the local DB migrated, execute the draw once against local (`SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local service key from 'npx supabase status'> npx tsx scripts/weekly-draw.ts`), then load `/cards` and `/cards/draw`: panel, history entry, and the laurel on the winning copy all render. If local has no card_inventory rows, run `npm run seed:demo` first and open a pack via the UI, or insert a row by hand.

- [ ] **Step 6: Run the full checks and commit**

Run: `npm test`, `npx supabase test db`, `npm run lint`
Expected: all green.

```bash
git add src/app/cards/draw src/lib/cards/draw-queries.ts src/lib/cards/draw-queries.test.ts src/app/cards/page.tsx src/components/cards/CardsNav.tsx
git commit -m "feat: weekly draw panel and history page"
```

---

### Task 6: Docs and rollout notes

**Files:**
- Modify: `docs/backend.md` (the Database organization table — add `weekly_draws` to the Player cards row or a new row; add `run_weekly_draw` to the RPC families list)
- Modify: `README.md` (operations section: the weekly-draw workflow, its secrets, the manual-dispatch week override)

- [ ] **Step 1: Write the doc updates** — two focused edits matching each file's voice and table format.
- [ ] **Step 2: Full suite once more** — `npm test && npx supabase test db && npm run lint`. Expected: green.
- [ ] **Step 3: Commit**

```bash
git add docs/backend.md README.md
git commit -m "docs: weekly draw operations and schema notes"
```

- [ ] **Step 4: Rollout checklist (do not merge before these)**
  - `npx supabase migration list` shows 20260831000001 pending only locally → hand to the user to run `npx supabase db push` against production ref `tyywoneobreracfnujdk` (NEVER `jmhgextkwsaodtnjtvvp`).
  - After the push, user verifies with `npx supabase migration list`, then merge `weekly-draw` → `main` (Vercel deploys).
  - Confirm the three GitHub secrets exist for the workflow (they do for detect-moments; `DISCORD_CARDS_WEBHOOK_URL` per weekly-card-drop.yml — verify it's an environment secret under `Production`).
  - Seed the league's first announcement manually (the user posts, or run the workflow via dispatch for the just-completed week).
