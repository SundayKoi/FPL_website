# My Team and Player Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every verified, rostered FPL or FPL Academy player a private My Team dashboard while preserving captain/admin controls and allowing identity links through admin assignment, team-page claims, and compatible card claims.

**Architecture:** Add a season- and league-scoped `player_identity_links` table protected by RLS, then resolve the signed-in profile to an exact canonical player and league team. Refactor the existing Captain surface into role-aware My Team read models and components; captains and admins receive their existing mutation tools, while ordinary players receive only team-safe data and spectator/scouting links.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Supabase Auth/Postgres/RLS, Vitest/Testing Library, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-25-league-navigation-and-my-team-design.md`

## Global Constraints

- Read `README.md`, `docs/backend.md`, and the relevant guides in `node_modules/next/dist/docs/` before editing application code.
- Before database work, fetch `https://supabase.com/changelog.md`, scan relevant breaking changes, and consult current Supabase Auth/RLS documentation.
- Use a new forward migration created with `npx supabase migration new player_identity_links`; do not hand-name or edit an applied migration.
- Add matching pgTAP coverage in `supabase/tests/0067_player_identity_links_test.sql`.
- Use cookie-bound anon clients for user-scoped work. Never expose or import a service-role client in My Team, identity claims, or player-linking UI.
- UI visibility is presentation only. RLS and database helpers enforce every private read and write.
- Preserve current captain/admin access during backfill and preserve unrelated working-tree changes.
- Result reporting remains captain/admin-only; a spectator draft link never grants draft mutations.
- Free-form Discord handles are forbidden. Admin linking selects an existing `profiles` row created by sign-in.

---

### Task 1: Player identity schema, constraints, and RLS

**Files:**
- Create via Supabase CLI: migration printed by `npx supabase migration new player_identity_links`
- Create: `supabase/tests/0067_player_identity_links_test.sql`
- Modify: `supabase/tests/verify_pending_migrations.sql`

**Interfaces:**
- Produces table `public.player_identity_links` with columns `id`, `player_pool_id`, `profile_id`, `league_team_id`, `league`, `season`, `status`, `source`, `requested_by`, `decided_by`, `requested_at`, and `decided_at`.
- Produces `public.is_approved_team_member(p_league_team_id uuid, p_season text) returns boolean`.
- Produces `public.is_player_rostered_on_team(p_player_pool_id uuid, p_league_team_id uuid, p_league text, p_season text) returns boolean`.
- Produces `public.player_identity_state(p_player_pool_id uuid, p_league text, p_season text) returns text` returning only `unclaimed`, `pending`, or `claimed`.
- Adds nullable `card_claims.player_pool_id` and produces `public.approve_card_claim(p_season text, p_summoner text, p_tag text)` so card ownership and an exact compatible identity link are approved atomically.
- Extends `match_codes_select` so approved team members can read their own fixture codes.

- [ ] **Step 1: Create the migration and write failing pgTAP schema tests**

Run `npx supabase migration new player_identity_links`, record the exact generated path, then add assertions equivalent to:

```sql
begin;
select plan(34);

select has_table('public', 'player_identity_links');
select columns_are(
  'public', 'player_identity_links',
  array['id','player_pool_id','profile_id','league_team_id','league','season','status','source','requested_by','decided_by','requested_at','decided_at']
);
select has_function('public', 'is_approved_team_member', array['uuid','text']);
select has_function('public', 'is_player_rostered_on_team', array['uuid','uuid','text','text']);
select has_function('public', 'player_identity_state', array['uuid','text','text']);
select has_function('public', 'approve_card_claim', array['text','text','text']);

select col_is_fk('public', 'player_identity_links', 'player_pool_id');
select col_is_fk('public', 'player_identity_links', 'profile_id');
select col_is_fk('public', 'player_identity_links', 'league_team_id');
select col_is_fk('public', 'player_identity_links', 'requested_by');
select col_is_fk('public', 'player_identity_links', 'decided_by');

select finish();
rollback;
```

Add role fixtures and policy tests proving self-insert/self-withdraw, captain-scoped approval, admin assignment/revocation, uniqueness, immediate revocation, sanitized public claim state, and match-code access for own-team members only.

- [ ] **Step 2: Run the database test and verify it fails**

Run: `npx supabase test db`

Expected: FAIL because `player_identity_links`, its helpers, and member code access do not exist.

- [ ] **Step 3: Implement the migration**

Create the table and indexes with the exact contract:

```sql
create table public.player_identity_links (
  id uuid primary key default gen_random_uuid(),
  player_pool_id uuid not null references public.player_pool(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  league_team_id uuid references public.league_teams(id) on delete set null,
  league text not null check (league in ('premier', 'academy')),
  season text not null,
  status text not null check (status in ('pending', 'approved')),
  source text not null check (source in ('admin', 'team', 'card')),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  decided_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status = 'approved' and decided_by is not null and decided_at is not null)
  ),
  unique (player_pool_id, league, season),
  unique (profile_id, league, season)
);

create index player_identity_links_team_season_idx
  on public.player_identity_links (league_team_id, season)
  where league_team_id is not null;
create index player_identity_links_requested_by_idx
  on public.player_identity_links (requested_by);
create index player_identity_links_decided_by_idx
  on public.player_identity_links (decided_by)
  where decided_by is not null;
```

Enable RLS. Grant authenticated users only the operations required by the policies; grant no anonymous table access. Policies must use `(select auth.uid())`, `public.is_admin()`, and the existing `public.is_captain_of(team, season)` predicate. A normal user may insert only a pending `source = 'team'` row for their own profile/requester, with a non-null team for which `is_player_rostered_on_team(...)` returns true, and may delete only their own pending row. Captains can update/delete only rows for their team and season. Admins can perform all operations.

Implement `is_player_rostered_on_team` as a stable exact-ID helper. It verifies that the canonical player is assigned in the active Premier or Academy draft and that the draft team's normalized name resolves to the supplied `league_teams.id` for the supplied season. Use it in INSERT and captain-decision policies so a forged client cannot claim a player under the wrong team.

Implement the sanitized status helper with no profile data in its result. Revoke default execute before granting it to `anon, authenticated`.

Implement `is_approved_team_member` as a stable, fixed-search-path helper that checks the caller's approved row by indexed `profile_id`, `league_team_id`, and `season`. Extend `match_codes_select` to:

```sql
using (
  public.is_admin()
  or public.is_captain_of(team_a_id, season)
  or public.is_captain_of(team_b_id, season)
  or public.is_approved_team_member(team_a_id, season)
  or public.is_approved_team_member(team_b_id, season)
);
```

Keep current captains working independently of identity links.

Add nullable `card_claims.player_pool_id uuid references player_pool(id) on delete set null` plus its foreign-key index. Implement `approve_card_claim` as a fixed-search-path security-definer RPC that:

1. locks the caller-authorized pending card claim;
2. verifies `can_moderate_card` for the exact season/Riot identity;
3. marks the card claim approved;
4. when `player_pool_id` is non-null and the claimed Riot account has exactly one `roster_memberships` team in that season, inserts or approves the matching `player_identity_links` row; and
5. otherwise performs only the card approval.

Revoke execute from `public, anon`, grant only `authenticated, service_role`, and test that a forged or conflicting mapping rolls back the whole RPC.

- [ ] **Step 4: Run pgTAP and verify the contract passes**

Run: `npx supabase test db`

Expected: all tests pass, including `0067_player_identity_links_test.sql`.

- [ ] **Step 5: Run database advisors and inspect migration ordering**

Run:

```bash
npx supabase db advisors --local
npx supabase migration list --local
```

Expected: no new security/performance findings from the identity table or helpers; the generated migration appears after every applied migration.

- [ ] **Step 6: Commit the database slice**

```bash
git add supabase/migrations/*_player_identity_links.sql supabase/tests/0067_player_identity_links_test.sql supabase/tests/verify_pending_migrations.sql
git commit -m "feat: add verified player identity links"
```

### Task 2: Typed identity resolution and mutation boundaries

**Files:**
- Create: `src/lib/players/identity.ts`
- Create: `src/lib/players/identity.test.ts`
- Create: `src/lib/players/identityActions.ts`
- Create: `src/lib/players/identityActions.test.ts`

**Interfaces:**
- Produces `type LeagueKey = "premier" | "academy"`.
- Produces `type PlayerIdentityStatus = "unlinked" | "pending" | "approved" | "approved_unrostered"`.
- Produces `resolvePlayerIdentity(supabase, league): Promise<ResolvedPlayerIdentity>`.
- Produces server actions `requestPlayerIdentityClaim`, `withdrawPlayerIdentityClaim`, `decidePlayerIdentityClaim`, `assignPlayerIdentity`, and `revokePlayerIdentity`.

- [ ] **Step 1: Write failing pure-resolution and action tests**

Cover exact outcomes:

```ts
expect(await resolvePlayerIdentity(client, "premier")).toEqual({
  profileId: "profile-1",
  status: "approved",
  linkId: "link-1",
  playerPoolId: "pool-1",
  leagueTeamId: "team-1",
  season: "S5",
  isCaptain: false,
  isAdmin: false,
});
```

Also test signed-out, unlinked, pending, approved with `league_team_id = null`, captain-without-link, admin-without-link, forged `profileId`, cross-league IDs, and friendly unique-conflict errors.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- src/lib/players/identity.test.ts src/lib/players/identityActions.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement `identity.ts`**

Define:

```ts
export type ResolvedPlayerIdentity = {
  profileId: string | null;
  status: PlayerIdentityStatus;
  linkId: string | null;
  playerPoolId: string | null;
  leagueTeamId: string | null;
  season: string;
  isCaptain: boolean;
  isAdmin: boolean;
};

export async function resolvePlayerIdentity(
  supabase: SupabaseClient,
  league: LeagueKey,
): Promise<ResolvedPlayerIdentity>;
```

Resolve the current user with `auth.getUser()`, current league season from `league_settings`, the caller's own identity row under RLS, and existing captain/admin context. Do not accept a profile ID or team override from the browser.

- [ ] **Step 4: Implement server actions with parsed inputs**

Use discriminated input types:

```ts
export type RequestIdentityInput = {
  playerPoolId: string;
  leagueTeamId: string;
  league: LeagueKey;
  season: string;
};

export type DecideIdentityInput = {
  linkId: string;
  decision: "approve" | "reject";
};
```

Each action creates a cookie-bound server client and relies on RLS for the final write. Admin assignment looks up an existing profile ID; it never accepts or stores a typed Discord name. Normalize database errors into `Identity already linked`, `Profile already linked`, or `Unable to update player identity` without exposing SQL details.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/lib/players/identity.test.ts src/lib/players/identityActions.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the identity application boundary**

```bash
git add src/lib/players/identity.ts src/lib/players/identity.test.ts src/lib/players/identityActions.ts src/lib/players/identityActions.test.ts
git commit -m "feat: resolve and manage player identities"
```

### Task 3: Admin Discord-profile linking on Players pages

**Files:**
- Create: `src/components/players/PlayerIdentityAdmin.tsx`
- Create: `src/components/players/PlayerIdentityAdmin.test.tsx`
- Modify: `src/components/players/PlayerPoolAdmin.tsx`
- Modify: `src/components/players/PlayerPoolAdmin.test.tsx`
- Modify: `src/components/players/PlayersDirectory.tsx`
- Modify: `src/app/players/page.tsx`
- Modify: `src/app/academy/players/page.tsx`

**Interfaces:**
- Consumes identity actions from Task 2.
- Produces `VerifiedProfileOption = { id: string; displayName: string; discordId: string | null }`.
- Produces `PlayerIdentityAdmin` props `{ playerPoolId, league, season, currentLink, profiles }`.

- [ ] **Step 1: Write failing component and page-data tests**

Test that the editor shows `Unlinked`, `Pending — <display name>`, or `Linked — <display name>`; filters profiles by display name or Discord ID; assigns only the selected profile ID; confirms replacement/revocation; and never renders a free-form Discord input.

```tsx
expect(screen.queryByRole("textbox", { name: /discord name/i })).toBeNull();
fireEvent.change(screen.getByRole("combobox", { name: /verified discord profile/i }), {
  target: { value: "profile-2" },
});
fireEvent.click(screen.getByRole("button", { name: /link profile/i }));
expect(assignPlayerIdentity).toHaveBeenCalledWith(expect.objectContaining({ profileId: "profile-2" }));
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/components/players/PlayerIdentityAdmin.test.tsx src/components/players/PlayerPoolAdmin.test.tsx`

Expected: FAIL because the identity editor and props do not exist.

- [ ] **Step 3: Implement page data and the focused editor**

Both league Players pages fetch `profiles(id, display_name, discord_id)` and identity links for their active league/season using the server client. Pass those rows only when the existing admin/owner gate permits editing. Keep `PlayerPoolAdmin` responsible for canonical pool fields; render `PlayerIdentityAdmin` beside each existing player row rather than adding identity state to the canonical-player form object.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/components/players/PlayerIdentityAdmin.test.tsx src/components/players/PlayerPoolAdmin.test.tsx src/components/players/PlayersDirectory.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the admin-linking UI**

```bash
git add src/components/players/PlayerIdentityAdmin.tsx src/components/players/PlayerIdentityAdmin.test.tsx src/components/players/PlayerPoolAdmin.tsx src/components/players/PlayerPoolAdmin.test.tsx src/components/players/PlayersDirectory.tsx src/app/players/page.tsx src/app/academy/players/page.tsx
git commit -m "feat: link verified Discord profiles to players"
```

### Task 4: Team-page roster claims and identity approval queue

**Files:**
- Create: `src/components/teams/PlayerRosterClaim.tsx`
- Create: `src/components/teams/PlayerRosterClaim.test.tsx`
- Create: `src/app/identity-claims/page.tsx`
- Create: `src/app/identity-claims/page.test.tsx`
- Create: `src/components/players/IdentityClaimQueueRow.tsx`
- Create: `src/components/players/IdentityClaimQueueRow.test.tsx`
- Modify: `src/app/teams/[slug]/page.tsx`
- Modify: `src/app/academy/teams/[slug]/page.tsx`
- Modify: `src/app/cards/claims/page.tsx`
- Modify: `src/components/cards/CardClaim.tsx`
- Modify: `src/components/cards/CardClaim.test.tsx`

**Interfaces:**
- Consumes Task 2 identity actions.
- Produces team-row states `unclaimed | pending | claimed | mine-pending | mine-approved`.
- Produces one `/identity-claims` inbox for actionable team claims; `/cards/claims` links to it while preserving card-only approvals.

- [ ] **Step 1: Write failing roster-claim tests**

Cover signed-out return-to-login, self-request, withdrawal, neutral public `Claimed` state, no Discord identifier on public pages, and no action for empty roster slots.

```tsx
expect(screen.getByRole("link", { name: /sign in to claim/i }).getAttribute("href"))
  .toBe("/login?redirect=/teams/mint-ice-cubes");
expect(screen.queryByText(/discord id/i)).toBeNull();
```

- [ ] **Step 2: Write failing queue and card-synchronization tests**

Test captain-own-team approval, captain-other-team omission, admin-all-teams visibility, rejection deletion, and card approval behavior: an exact canonical mapping calls the common approval action; missing/ambiguous mappings approve only card ownership and leave team identity unapproved.

- [ ] **Step 3: Run the focused tests and verify failure**

Run: `npm test -- src/components/teams/PlayerRosterClaim.test.tsx src/app/identity-claims/page.test.tsx src/components/players/IdentityClaimQueueRow.test.tsx src/components/cards/CardClaim.test.tsx`

Expected: FAIL because the new claim surfaces and shared identity decision path do not exist.

- [ ] **Step 4: Implement team-page claim state and actions**

Fetch sanitized claim state in the team page without exposing `profile_id`. For the signed-in viewer, separately read only their own identity row under RLS. Pass stable `canonical_player_id`, league team ID, league, and current season into `PlayerRosterClaim`. Never derive authority from display names in the client.

- [ ] **Step 5: Implement the unified approval inbox**

Load pending rows visible under RLS and render exact team, player, claimant display name, source, and request date. Approve/reject with `decidePlayerIdentityClaim`. Captains see only their team; admins see all. Link the existing card-claim page to this inbox so reviewers have one entry point.

- [ ] **Step 6: Synchronize compatible card approvals**

Route card approval through a server action. At claim creation, store `card_claims.player_pool_id` only when the server-side card query resolves exactly one canonical player in the same league/season; otherwise store null. Approval calls Task 1's `approve_card_claim` RPC, which rechecks moderation and identity constraints atomically. A null canonical ID approves only the card claim.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- src/components/teams/PlayerRosterClaim.test.tsx src/app/identity-claims/page.test.tsx src/components/players/IdentityClaimQueueRow.test.tsx src/components/cards/CardClaim.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit claim onboarding and review**

```bash
git add src/components/teams/PlayerRosterClaim.tsx src/components/teams/PlayerRosterClaim.test.tsx 'src/app/teams/[slug]/page.tsx' 'src/app/academy/teams/[slug]/page.tsx' src/app/identity-claims/page.tsx src/app/identity-claims/page.test.tsx src/components/players/IdentityClaimQueueRow.tsx src/components/players/IdentityClaimQueueRow.test.tsx src/app/cards/claims/page.tsx src/components/cards/CardClaim.tsx src/components/cards/CardClaim.test.tsx
git commit -m "feat: let players claim roster identities"
```

### Task 5: My Team read model and role-safe components

**Files:**
- Create: `src/lib/my-team/queries.ts`
- Create: `src/lib/my-team/queries.test.ts`
- Create: `src/lib/my-team/types.ts`
- Create: `src/components/my-team/MyTeamGate.tsx`
- Create: `src/components/my-team/MyTeamGate.test.tsx`
- Create: `src/components/my-team/TeamSchedule.tsx`
- Create: `src/components/my-team/TeamSchedule.test.tsx`
- Modify: `src/components/captain/NextMatchCard.tsx`
- Modify: `src/components/captain/NextMatchCard.test.tsx`
- Modify: `src/components/captain/MyRoster.tsx`
- Modify: `src/components/captain/MyRoster.test.tsx`

**Interfaces:**
- Consumes `resolvePlayerIdentity` from Task 2.
- Produces `loadMyTeamDashboard(supabase, league, adminTeamId?): Promise<MyTeamDashboardResult>`.
- Produces result union `signed-out | unlinked | pending | unrostered | ready`.
- `ready` contains `team`, `season`, `nextFixture`, `codes`, `draftGames`, `schedule`, `roster`, `opponent`, `isCaptain`, and `isAdmin`.

- [ ] **Step 1: Write failing read-model tests**

Cover every result union member, league scoping, admin validated team override, ignored player/captain query override, own-team codes, no-match schedule retention, and isolated scouting-data failure.

```ts
expect(await loadMyTeamDashboard(client, "academy")).toMatchObject({
  kind: "ready",
  season: "A1",
  team: { id: "academy-team-1", name: "Academy One" },
  isCaptain: false,
  isAdmin: false,
});
```

- [ ] **Step 2: Run read-model tests and verify failure**

Run: `npm test -- src/lib/my-team/queries.test.ts`

Expected: FAIL because the My Team data layer does not exist.

- [ ] **Step 3: Implement the read model by extracting existing Captain queries**

Reuse `pickNextFixture`, `fetchCodes`, `fetchDraftGames`, `fetchMyRoster`, `fetchMyResults`, and existing league filtering. Resolve identity/captain/admin first, then query one active team. Ordinary players and captains cannot select a team via URL; only admins may pass a team ID that exists in the active league set.

- [ ] **Step 4: Write failing component-state tests**

Test signed-out sign-in copy, unlinked team-page guidance, pending withdrawal guidance, approved-unrostered explanation, next match, Watch Draft, Scout Opponent, copyable codes, schedule, highlighted player, and omission of captain/admin actions from player-safe components.

- [ ] **Step 5: Implement focused reusable components**

Keep existing `TourneyCodes` unchanged except for copy/context wording. Extend `NextMatchCard` with a spectator-first `Watch Draft` label. Add `TeamSchedule` and highlight the signed-in `playerPoolId` in `MyRoster`. Do not place result-report or admin controls inside any component imported by the ordinary-player branch.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- src/lib/my-team/queries.test.ts src/components/my-team/MyTeamGate.test.tsx src/components/my-team/TeamSchedule.test.tsx src/components/captain/NextMatchCard.test.tsx src/components/captain/MyRoster.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the My Team read model**

```bash
git add src/lib/my-team/queries.ts src/lib/my-team/queries.test.ts src/lib/my-team/types.ts src/components/my-team/MyTeamGate.tsx src/components/my-team/MyTeamGate.test.tsx src/components/my-team/TeamSchedule.tsx src/components/my-team/TeamSchedule.test.tsx src/components/captain/NextMatchCard.tsx src/components/captain/NextMatchCard.test.tsx src/components/captain/MyRoster.tsx src/components/captain/MyRoster.test.tsx
git commit -m "feat: build role-safe My Team dashboard data"
```

### Task 6: Canonical My Team and scouting routes with redirects

**Files:**
- Create: `src/app/my-team/page.tsx`
- Create: `src/app/my-team/page.test.tsx`
- Create: `src/app/my-team/scouting/page.tsx`
- Create: `src/app/my-team/scouting/page.test.tsx`
- Create: `src/app/academy/my-team/page.tsx`
- Create: `src/app/academy/my-team/scouting/page.tsx`
- Modify: `src/app/captain/page.tsx`
- Modify: `src/app/captain/page.test.tsx`
- Modify: `src/app/captain/scouting/page.tsx`
- Modify: `src/app/captain/scouting/page.test.tsx`
- Modify: `src/app/academy/captain/page.tsx`
- Modify: `src/app/academy/captain/scouting/page.tsx`
- Modify: `src/lib/league/links.ts`
- Modify: `src/lib/league/links.test.ts`

**Interfaces:**
- Consumes Task 5 `loadMyTeamDashboard` and existing captain/admin components.
- Produces canonical routes `/my-team`, `/my-team/scouting`, `/academy/my-team`, and `/academy/my-team/scouting`.
- Produces `LeaguePage` values `my-team` and `scouting` mapped to canonical routes.

- [ ] **Step 1: Write failing route composition and redirect tests**

Test that a ready ordinary player sees next match, codes, schedule, roster, Watch Draft, and Scouting but not Report a Result or admin editors. Test captain/admin extras separately. Mock `next/navigation.redirect` and assert the four legacy routes redirect to their exact league equivalents while preserving validated admin `team` query parameters.

- [ ] **Step 2: Run route tests and verify failure**

Run: `npm test -- src/app/my-team/page.test.tsx src/app/my-team/scouting/page.test.tsx src/app/captain/page.test.tsx src/app/captain/scouting/page.test.tsx src/lib/league/links.test.ts`

Expected: FAIL because the canonical routes and link mappings do not exist.

- [ ] **Step 3: Implement the shared page views**

Export `MyTeamPageView({ league, searchParams })` from `src/app/my-team/page.tsx`. Premier calls it directly; Academy wraps it with `league="academy"`. Render player-safe sections for every `ready` user. Append `ReportBox` and captain operations only when `isCaptain || isAdmin`; append admin editors only when `isAdmin`.

- [ ] **Step 4: Implement canonical scouting authorization**

Move the existing scouting composition to `/my-team/scouting`. Resolve the team through `loadMyTeamDashboard`; accept `?team=` only for admins. Keep the safe temporary-unavailable state and the existing league-scoped scouting queries.

- [ ] **Step 5: Replace legacy pages with redirects and update link helpers**

Use Next.js `redirect()` in each legacy route. Update `leaguePath("my-team", league)` and `leaguePath("scouting", league)` to return the canonical paths. Do not leave duplicated Captain page implementations behind.

- [ ] **Step 6: Run route tests**

Run: `npm test -- src/app/my-team/page.test.tsx src/app/my-team/scouting/page.test.tsx src/app/captain/page.test.tsx src/app/captain/scouting/page.test.tsx src/lib/league/links.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit canonical routes and redirects**

```bash
git add src/app/my-team src/app/academy/my-team src/app/captain src/app/academy/captain src/lib/league/links.ts src/lib/league/links.test.ts
git commit -m "feat: replace captain hub with My Team"
```

### Task 7: Documentation and complete My Team verification

**Files:**
- Modify: `README.md`
- Modify: `docs/backend.md`

**Interfaces:**
- Documents the player/captain/admin roles, identity lifecycle, RLS boundary, canonical routes, and legacy redirects.

- [ ] **Step 1: Update role and backend documentation**

In `README.md`, replace the captain-only dashboard description with player/captain/admin My Team behavior. In `docs/backend.md`, document `player_identity_links`, claim sources, approval rules, member code access, cookie-bound clients, canonical routes, and redirect compatibility.

- [ ] **Step 2: Run all narrow My Team checks**

```bash
npm test -- src/lib/players/identity.test.ts src/lib/players/identityActions.test.ts src/components/players/PlayerIdentityAdmin.test.tsx src/components/teams/PlayerRosterClaim.test.tsx src/app/identity-claims/page.test.tsx src/lib/my-team/queries.test.ts src/app/my-team/page.test.tsx src/app/my-team/scouting/page.test.tsx src/lib/league/links.test.ts
npx supabase test db
```

Expected: PASS.

- [ ] **Step 3: Run repository-wide checks**

```bash
npm run lint
npm test
npm run build
npx supabase test db
```

Expected: all commands exit 0. If the local Supabase stack is unavailable, start it with `npx supabase start` and rerun pgTAP rather than skipping the database contract.

- [ ] **Step 4: Review the complete diff for access regressions**

Confirm no service-role import appears under `src/app/my-team`, `src/components/my-team`, `src/components/teams/PlayerRosterClaim.tsx`, or `src/lib/players/identityActions.ts`; no ordinary-player branch imports `ReportBox`; and no legacy route still renders the old Captain page.

- [ ] **Step 5: Commit documentation and final verification fixes**

```bash
git add README.md
git add -p docs/backend.md
git commit -m "docs: document player identity and My Team"
```
