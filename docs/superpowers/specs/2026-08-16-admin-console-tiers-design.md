# Admin console and staff tiers

**Date:** 2026-08-16
**Status:** Approved for planning

## Problem

Admin controls are scattered across ten pages: `/schedule` (season, phase,
fixtures, generate draw), `/teams`, `/players`, `/captain` (codes, reports
queue, league teams, rosters), `/signup`, `/info`, `/admin` (drafts, homepage
mode, staff, brief), `/admin/betting` (six panels), `/draft/[id]`, and
`/admin/[draftId]`. There is no single place to administer the league, and no
way to give someone the routine controls without also giving them the ones
that can break the site.

The database knows only `is_admin()`. Every admin can write to
`league_settings`, `drafts`, `teams`, `league_teams` and `fixtures`. Hiding a
control in the UI would not stop a determined admin from changing the season
through a REST call, which is the change most capable of corrupting the
league's stats.

## Approach

Reuse the existing two-tier model rather than inventing a third role.
`20260817000001_admin_owners.sql` already added `profiles.is_owner` and
`public.is_owner()`, with owners able to grant and revoke admin via
`set_profile_admin`, and owner status deliberately unreachable from the
application. That migration seeded every then-current admin as an owner, which
is why the tiers do not currently match intent.

- **Owner** — dribb and spiesss. Everything.
- **Admin** — everyone else. Routine league operations only.

Gating is enforced in the database, not just the UI. The browser writes to
tables directly through supabase-js, so RLS is the enforcement layer.

### Rejected alternatives

- **A third tier above owner.** Unnecessary: trimming the owner set expresses
  the same thing with no new role and no new RLS vocabulary.
- **A `can_manage(area)` capability table.** Configurable tiers without
  migrations, at the cost of a lookup on every RLS check and real indirection
  when debugging a denied write. Over-engineered for two roles that change
  rarely.
- **Routing every owner write through `SECURITY DEFINER` RPCs.** Most explicit,
  but rewrites every client write call for no safety gain over RLS.

## Permission line

Principle: **admin is routine, reversible league operations; owner is anything
that changes the shape of the league or is hard to undo.**

| Control | Tier |
|---|---|
| Season, phase, Academy season | Owner |
| Featured / Academy draft selection | Owner |
| Homepage mode | Owner |
| Create/delete draft, draft setup, player pool, avg bids | Owner |
| Generate schedule (bulk draw) | Owner |
| Create / delete fixtures | Owner |
| League teams (add / retire / rename) | Owner |
| Betting seasons, user balances, settlement | Owner |
| Grant / revoke admin | Owner |
| Fixture scores and dates | Admin |
| Live draft room (start, pause, force-nominate, overrides) | Admin |
| Tourney codes (enter, import, bulk replace) | Admin |
| Match reports queue | Admin |
| Roster memberships (Riot IDs) | Admin |
| Sync teams / captains from draft | Admin |
| Team identity (image, banner colour, abbreviation) | Admin |
| Homepage brief edit / publish | Admin |
| Info resources, league links, announcements | Admin |
| Signups open/close, review, delete | Admin |
| Betting catalog, props, pickems, markets | Admin |

Setting a draft up is owner work; running one is admin work. This falls out of
the architecture for free — the live draft actions are already `SECURITY
DEFINER` RPCs guarded by `_require_admin()`, so they bypass RLS and need no
change.

The guided, idempotent sync RPCs (`sync_league_teams_from_draft`,
`sync_academy_teams_from_draft`) stay admin-callable even though they write
`league_teams`: they are `SECURITY DEFINER`, so they bypass the owner-only
policy by design. The freehand `league_teams` editor is owner-only. The guided
path is safe; the freehand path is what retired Astronauts and Wildcats.

## Enforcement

**Column grants cannot express this split.** Supabase gives every logged-in
user the same `authenticated` Postgres role, so owners and admins are
indistinguishable at grant level: revoking a column from admins revokes it from
owners too. Grants gate by role; this gates by a flag inside a row. The split
must therefore happen by one of two mechanisms, chosen per table.

### Operation-level: plain RLS

Where the line falls between commands, policies handle it natively.

```sql
create policy fixtures_admin_update on public.fixtures
  for update using (public.is_admin()) with check (public.is_admin());
create policy fixtures_owner_insert on public.fixtures
  for insert with check (public.is_owner());
create policy fixtures_owner_delete on public.fixtures
  for delete using (public.is_owner());
```

### Column-level: narrow RPC

Where the line falls within a row, the table becomes owner-write-only and
admins get a `SECURITY DEFINER` function for their slice. Two are needed:

- `set_signups_open(p_open boolean)` — `league_settings` is otherwise
  owner-only. The current signups toggle upserts the whole row and would break
  once the table is gated, so it must move to this RPC regardless.
- `set_team_identity(p_team_id uuid, p_image_url text, p_banner_color text,
  p_abbreviation text)` — `teams` is otherwise owner-only.

Both guard with `_require_admin()`.

### Map

| Table | Change |
|---|---|
| `league_settings` | → `is_owner()`; admins via `set_signups_open` |
| `drafts`, `players`, `free_agency_avg_bids` | → `is_owner()` |
| `teams` | → `is_owner()`; admins via `set_team_identity` |
| `league_teams` | → `is_owner()` |
| `fixtures` | admin `UPDATE`; owner `INSERT` / `DELETE` |
| `match_codes`, `match_reports`, `match_report_games`, `roster_memberships`, `signups`, `info_resources`, `homepage_briefs`, `announcements` | unchanged (admin) |
| `_require_admin()` RPCs (draft room, bulk codes, syncs) | unchanged (admin) |
| betting (all tables) | **no RLS change** — see below |

### Betting is gated in the action layer, not the database

Betting does not use RLS for writes at all. `20260813000001_betting_schema.sql`
grants `authenticated` only `select`; every write goes through a Next.js server
action in `src/lib/betting/admin-actions.ts`, which authorizes with
`requireBettingStaff()` and then writes using a `service_role` client that
bypasses RLS entirely. The money-moving RPCs
(`resolve_market_admin`, `cancel_market_admin`, …) are explicitly revoked from
`anon` and `authenticated`, so a browser cannot reach them under any tier.

The betting gate is therefore a new `requireBettingOwner()` in
`src/lib/betting/access.ts`, applied per action:

- **Owner:** `resolveMarket`, `cancelMarket`, `deleteMarket`, `resolvePickem`,
  `cancelPickem`, `createSeason`, `closeSeason`, `grantPoints` — settlement,
  payouts and balances.
- **Admin (unchanged):** `createMarket`, `createPickem`, `upsertTeam`,
  `upsertEvent`, `upsertStoreItem`, `deleteTeam`, `deleteEvent`,
  `deleteStoreItem`, `approveProp`, `rejectProp` — catalog work, reversible
  before settlement.

This splits by reversibility: creating a market can be undone, settling one
pays out and cannot.

New helper `public._require_owner()`, mirroring `_require_admin()`.

### Accepted granularity limit

An admin's `UPDATE` on `fixtures` covers the whole row, so they can edit a
fixture's teams or season, not only its score. Freezing those columns would
need a trigger comparing `OLD`/`NEW` against `is_owner()`. Deliberately not
done: admins are trusted staff and a wrong team name is trivially reversible,
unlike everything actually gated.

## Page

`/admin` keeps its route and becomes the console. Sections are ordered by how
often they are touched, weekly work first, dangerous config last.

```
/admin
  This week          Match reports · tourney codes · fixture scores
  Rosters            Riot IDs · sync teams & captains · team identity
  Content            Homepage brief · info resources · announcements · signups
  Betting            Catalog · props · pickems · markets
  ─────────────────  owner only, below a visible divider
  League config      Season · phase · Academy season · homepage mode
  Drafts             Create · delete · setup · player pool · featured draft
  Schedule structure Generate draw · create/delete fixtures
  League teams       Add · retire · rename
  Betting seasons    Seasons · user balances · settlement
  Staff              Grant / revoke admin
```

Owner sections are **hidden entirely** for a non-owner, not disabled. A
disabled control invites "why can't I click this"; the point of the tier is
that these people do not need to think about them. Section headers vanish too.
One exception: the divider stays with a single line reading "Some league
configuration is owner-only", so nobody thinks the page is broken.

Sections are server-rendered per tier, so owner markup is never sent to a
non-owner's browser. This is presentation only — the database is the real gate.

Feature pages (`/schedule`, `/teams`, `/players`, `/signup`, `/info`,
`/captain`) lose their admin panels and become read-only views. `/captain`
keeps everything captains use; only its four admin panels move. The live draft
room keeps its controls, which are useless anywhere else.

## Rollout

Four independently shippable steps, in order:

1. **Owner demotion.** Trims the owner set to dribb and spiesss. Three owners
   exist today, so one is demoted; `is_admin` is left untouched, so they keep
   every admin power. Invisible until step 2.
2. **DB enforcement.** RLS swaps, `_require_owner()`, the two RPCs. The gate
   becomes real here.
3. **New `/admin`.** All controls, tier-gated. Feature pages still work, so
   controls are briefly duplicated — the safe state.
4. **Strip feature pages.** Only after step 3 is confirmed complete.

The demotion runs and is verified before enforcement, so there is no window
where the gate is live against a wrong owner set. `service_role` bypasses RLS,
so the SQL editor is always a way back in.

The demotion is self-verifying rather than trusting a name guess:

```sql
update public.profiles set is_owner = false
where is_owner and lower(display_name) not in ('dribb', 'spiesss');
-- raise unless exactly 2 owners remain
```

If the names do not match exactly two profiles it fails loudly and rolls back,
rather than quietly demoting everyone and leaving nobody able to reach league
config from the site.

## Testing

- **pgTAP, per gated table:** an admin write is rejected, an owner write
  succeeds. This is the layer that proves the gate; it is how
  `set_profile_admin` is already tested.
- **pgTAP for the demotion guard:** a profile set that does not resolve to
  exactly two owners aborts.
- **pgTAP for both new RPCs:** an admin succeeds, an anonymous caller does not,
  and the RPC cannot write columns outside its slice.
- **Vitest for the betting actions:** each owner-tier action refuses a
  non-owner staff caller and performs no write, mirroring the existing
  authorization suite in `admin-actions.test.ts`.
- **Vitest for tier rendering:** a non-owner's rendered output contains no
  owner section, and an owner's contains all of them.
