# Card Expeditions — design

2026-08-27. Status: approved direction, pending user review of this spec.

## What this is

A collection game: pick a squad of three owned cards and send them on an
expedition. They are locked while deployed and come back hours later with
loot. Squad quality — specifically foils and signed cards — gates which
expeditions you can launch and scales what comes back. The collection
becomes a roster you deploy, not a wall you look at.

Design constraints inherited from the site:

- Nothing here changes pack odds, card ratings, or anyone's rating — the
  supporters-page promise stays intact. Expedition rewards come from their
  own loot rolls, not the pack roller.
- Cards are never lost or damaged. Outcomes range from poor to jackpot;
  the floor is always a positive (if small) reward.
- DB enforces the rules; UI gating is presentation only.

## Game rules

### Shine

Every copy has a **shine score**, computed in code from the frozen copy
(same read pattern as dust pricing — copy columns + card json):

- Base: the card tier's index in the tier ladder (bronze = 1 upward;
  reuse the canonical tier order from `src/lib/cards/build.ts`).
- Parallel bonus: prisma +1, aurora +2, refractor +3, ice +4
  (mirrors `FOIL_TYPE_DUST_MULT` ordering).
- Signed copy: +4.
- Moments and champions relics: flat shine 6 (they have no tier ladder).

All numbers live in `src/lib/expeditions/config.ts` — one file to tune,
like `packs/config.ts`.

### Expedition tiers

| Tier | Entry requirement | Duration | Reward band |
| --- | --- | --- | --- |
| Scouting Run | any 3 cards | 8h | small dollars |
| Deep Raid | ≥1 foil in squad AND squad shine ≥ 12 | 24h | mid dollars, small chance of a pack comp |
| Legend Hunt | ≥2 foils AND ≥1 signed card AND squad shine ≥ 20 | 48h | big dollars, real chance of a pack comp |

- "Dollars" are the existing betting wallet (`betting_profiles.balance`),
  credited through the existing ledgered grant path — never a raw update.
- Pack comps are granted via `card_pack_comps` (its `kind` column was
  designed for reuse). If the open flow only honors `kind='champions'`
  today, extend it to a standard-shelf kind as part of this work.
- Exact reward numbers are tuned at implementation against `PACK_COST`
  in `packs/config.ts`, with the dust-economy rule kept: expected value
  must stay below pack price so expeditions supplement, never replace,
  the economy. Reward bands and odds are config constants.

### Outcome roll

At claim time the server rolls poor / solid / jackpot (weights per tier
in config), then scales the dollar payout by:

- squad shine above the tier's threshold (small linear bonus, capped), and
- the daily brief bonus (below) when satisfied.

### Daily briefs

Each day carries a brief, deterministic from the UTC date (hash → config
table in code, no DB): e.g. "Jungle recon — a jungler in the squad:
+20% yield". Briefs read the copies' `role` column. This makes *which*
cards you own matter, not just how shiny they are.

### Launch limits

- One launch per user per UTC day; active patrons get a second
  (the second-Daily-Rip precedent — a QoL slot, no odds effect).
- A copy cannot be in two active runs, cannot be melted, and cannot be
  traded while deployed.

## Data model

One migration (plus pgTAP):

```sql
create table public.expedition_runs (
  id          bigint generated always as identity primary key,
  discord_id  text not null references public.betting_profiles(discord_id),
  season      text not null,
  tier        text not null,            -- 'scout' | 'raid' | 'legend'
  squad       bigint[] not null,        -- card_inventory ids, length 3
  shine       int not null,
  started_at  timestamptz not null default now(),
  resolves_at timestamptz not null,
  outcome     jsonb,                    -- null until claimed
  claimed_at  timestamptz
);
```

- RLS: owner-only select (`discord_id` derived server-side, betting/banger
  pattern); all writes via RPC/service role. No anon access.
- Index on `(discord_id, season, claimed_at)` for the active-runs lookup.

### RPCs (security definer, service-role surface)

- `launch_expedition(p_user, p_season, p_tier, p_squad bigint[])` —
  in one transaction: verify the three copies exist, belong to `p_user`,
  and are not in any unclaimed run; recompute shine **server-side** from
  the copies (client shine is display only); check tier requirements
  (foil count from the copy's `foil` column + parallel/signed facts from
  `card` json); enforce the daily launch limit (patron check via
  `patron_until`); insert the run. Raise typed errors for each failure.
- `claim_expedition(p_user, p_run_id)` — verify ownership and
  `now() >= resolves_at` and unclaimed; roll the outcome (weights passed
  from app config, guarded like `open_card_pack`'s `p_cost`); write
  `outcome`/`claimed_at`; credit dollars via the existing ledger
  function; upsert the pack comp when rolled. One transaction.

### Locking melts and trades

Deployed copies must refuse melting and trading:

- App layer: dust and trade paths check membership in an active run and
  refuse with a clear message.
- DB backstop: a trigger on `card_inventory` delete (melt) and on the
  trade-acceptance path that rejects when the copy id appears in any run
  with `claimed_at is null`. The trigger is the guarantee; the app check
  is the UX.

## App structure

- `src/lib/expeditions/config.ts` — tiers, shine values, reward bands,
  briefs. Pure data + pure functions (`shineOf(copy)`,
  `squadMeets(tier, copies)`, `briefFor(date)`), unit-tested.
- `src/lib/expeditions/actions.ts` — server actions wrapping the RPCs,
  deriving the caller's Discord id like banger votes do.
- `/cards/expeditions` page (new tab in `CardsNav`): pick-squad flow
  showing live shine math and entry checks, active runs with countdowns,
  claim ceremony (reuse pack-reveal energy — but no card is minted; the
  reveal shows the loot), career log.
- Deployed copies get a small "on expedition" marker anywhere the
  collection renders (shelf, dust controls disabled state, trade builder
  exclusion).

## Announcements

Legend Hunt jackpots write an `announcements` row ("dribb's Legend Hunt
struck gold"), same queue the Discord poster drains. Lesser outcomes stay
quiet.

## Non-goals (v1)

- No expedition-exclusive art skins or cosmetic drops (future work; the
  reward pool is dollars + pack comps only).
- No multi-user co-op expeditions.
- No card loss, damage, durability, or any destructive mechanic — ever.

## Testing

- pgTAP: RLS (owner-only reads, no anon), launch validation (ownership,
  double-deploy, requirement failures, daily limit, patron second slot),
  claim validation (early claim, double claim, payout ledger row exists,
  comp upsert), melt/trade triggers.
- Vitest: shine math, requirement checks, brief determinism, reward
  scaling bounds.
- The narrow suites plus the README's broader checks before completion.

## Rollout

Migrations must be applied to production **before** the code merges to
main (deploy-ordering rule — Vercel auto-deploys main). Work on a
branch; `npx supabase migration list` to verify parity; the user runs
`npx supabase db push` (Claude's classifier blocks it).
