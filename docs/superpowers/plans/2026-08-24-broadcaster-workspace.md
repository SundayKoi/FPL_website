# Broadcaster Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an owner/broadcaster-only workspace for each league's featured match with two team scouting views, a role-by-role matchup view, and draft/OBS links.

**Architecture:** A server page authorizes the visitor, resolves the same Premier or Academy featured fixture as the homepage, and loads shared scouting history plus both rosters. Focused client components own tab, scouting-scope, and clipboard state; pure derivation code pairs roster members and scouting summaries by role.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Tailwind CSS v4, Supabase SSR client, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-24-broadcaster-workspace-design.md`

## Global Constraints

- Read `README.md`, `docs/backend.md`, and `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, `05-server-and-client-components.md`, and `06-fetching-data.md` before editing application code.
- `/broadcaster` allows `isOwner || isBroadcaster`; `isAdmin` alone never grants access.
- Use the homepage's `fetchHomepageSchedule`, `fetchHomepageFeaturedSettings`, and `selectHomepageFeaturedFixture`; do not introduce separate fixture selection.
- Derive `/match-draft/{fixtureId}` and `/match-draft/{fixtureId}?overlay=1&bg=transparent`; do not store another URL.
- Use the signed-in server Supabase client. Do not introduce the service-role client.
- Do not add a migration unless an authenticated read is proven to be blocked by RLS; if that happens, stop and revise the design before proceeding.
- Preserve the existing captain scouting behavior and wording by default.
- Preserve unrelated working-tree changes in `src/app/info/page.test.tsx`, `src/app/support-devs/page.test.tsx`, `src/components/info/SupportDevSection.tsx`, `.agents/`, and `skills-lock.json`.
- Follow TDD for every behavior change and make one focused commit per task.

## File Structure

### New files

- `src/lib/broadcaster/matchups.ts` — pure role/player matchup derivation and public matchup types.
- `src/lib/broadcaster/matchups.test.ts` — role ordering, duplicate-role, pool, and in-house mapping tests.
- `src/lib/broadcaster/workspace.ts` — featured-fixture and scouting-source server orchestration.
- `src/lib/broadcaster/workspace.test.ts` — league scoping, automatic fixture, shared history, and partial-data tests.
- `src/components/broadcaster/BroadcasterMatchups.tsx` — scope control and role-by-role comparison UI.
- `src/components/broadcaster/BroadcasterMatchups.test.tsx` — comparison rendering and empty-state tests.
- `src/components/broadcaster/BroadcasterFixtureHeader.tsx` — fixture metadata, Twitch, draft link, and OBS clipboard behavior.
- `src/components/broadcaster/BroadcasterFixtureHeader.test.tsx` — URLs, clipboard success, and fallback tests.
- `src/components/broadcaster/BroadcasterWorkspace.tsx` — league links and three-tab client workspace.
- `src/components/broadcaster/BroadcasterWorkspace.test.tsx` — tab and league-link interaction tests.
- `src/app/broadcaster/page.tsx` — protected server route and partial failure states.
- `src/app/broadcaster/page.test.tsx` — access matrix and server orchestration tests.

### Modified files

- `src/lib/auth/staffTier.ts` — centralized broadcaster-workspace access predicate.
- `src/lib/auth/staffTier.test.ts` — owner/broadcaster/admin access matrix.
- `src/components/SiteNavigation.tsx` — independent `showBroadcaster` link.
- `src/components/SiteNavigation.test.tsx` — broadcaster-link visibility independent of Admin.
- `src/app/layout.tsx` — calculate and pass `showBroadcaster`.
- `src/components/captain/OpponentScout.tsx` — neutral team-presentation variant.
- `src/components/captain/OpponentScout.test.tsx` — preserve opponent default and verify team copy.
- `src/lib/match-draft/rules.ts` — shared OBS overlay path helper.
- `src/lib/match-draft/rules.test.ts` — exact transparent-overlay path.
- `README.md` — document the broadcaster role and workspace.
- `docs/backend.md` — document access and data-flow boundaries.

---

### Task 1: Centralize broadcaster access and expose navigation

**Files:**
- Modify: `src/lib/auth/staffTier.ts`
- Modify: `src/lib/auth/staffTier.test.ts`
- Modify: `src/components/SiteNavigation.tsx`
- Modify: `src/components/SiteNavigation.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: existing `StaffTier` from `src/lib/auth/staffTier.ts`.
- Produces: `canAccessBroadcaster(tier: Pick<StaffTier, "isOwner" | "isBroadcaster">): boolean` and `SiteNavigation` prop `showBroadcaster?: boolean`.

- [ ] **Step 1: Read the repository and Next.js routing/component guidance**

Run:

```bash
sed -n '1,240p' README.md
sed -n '70,230p' docs/backend.md
sed -n '1,220p' node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md
sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
```

Expected: confirm the App Router server-layout pattern and repository authorization rules before editing.

- [ ] **Step 2: Write failing access and navigation tests**

Add the following cases to `staffTier.test.ts`:

```ts
expect(canAccessBroadcaster({ isOwner: true, isBroadcaster: false })).toBe(true);
expect(canAccessBroadcaster({ isOwner: false, isBroadcaster: true })).toBe(true);
expect(canAccessBroadcaster({ isOwner: false, isBroadcaster: false })).toBe(false);
```

Add a `SiteNavigation.test.tsx` case that renders these configurations separately:

```tsx
render(<SiteNavigation authSlot={<span>Account</span>} showBroadcaster />);
expect(screen.getByRole("link", { name: /^Broadcaster$/ }).getAttribute("href")).toBe("/broadcaster");
expect(screen.queryByRole("link", { name: /^Admin$/ })).toBeNull();
cleanup();

render(<SiteNavigation authSlot={<span>Account</span>} showAdmin />);
expect(screen.getByRole("link", { name: /^Admin$/ })).toBeTruthy();
expect(screen.queryByRole("link", { name: /^Broadcaster$/ })).toBeNull();
```

- [ ] **Step 3: Run the narrow tests and verify the new assertions fail**

Run:

```bash
npx vitest run src/lib/auth/staffTier.test.ts src/components/SiteNavigation.test.tsx
```

Expected: FAIL because `canAccessBroadcaster` and `showBroadcaster` do not exist.

- [ ] **Step 4: Implement the access predicate and navigation prop**

Add to `staffTier.ts`:

```ts
export function canAccessBroadcaster(
  tier: Pick<StaffTier, "isOwner" | "isBroadcaster">,
): boolean {
  return tier.isOwner || tier.isBroadcaster;
}
```

Extend `SiteNavigation` with `showBroadcaster = false` and render a top-level link independently from `showAdmin`:

```tsx
{showBroadcaster && (
  <Link
    href="/broadcaster"
    aria-current={isActive(pathname, "/broadcaster") ? "page" : undefined}
    onClick={closeMenus}
    className={topLinkClass(isActive(pathname, "/broadcaster"))}
  >
    Broadcaster
  </Link>
)}
```

In `src/app/layout.tsx`, retain the current Admin rule and pass the new rule separately:

```tsx
import { canAccessBroadcaster, fetchStaffTier } from "@/lib/auth/staffTier";

const tier = await fetchStaffTier(await createServerSupabase());
<SiteNavigation
  authSlot={<AuthButton />}
  showAdmin={tier.isAdmin || tier.isOwner || tier.isBroadcaster}
  showBroadcaster={canAccessBroadcaster(tier)}
/>
```

- [ ] **Step 5: Run the narrow tests and lint the changed files**

Run:

```bash
npx vitest run src/lib/auth/staffTier.test.ts src/components/SiteNavigation.test.tsx
npx eslint src/lib/auth/staffTier.ts src/lib/auth/staffTier.test.ts src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx src/app/layout.tsx
```

Expected: all tests PASS and ESLint exits 0.

- [ ] **Step 6: Commit the access/navigation slice**

```bash
git add src/lib/auth/staffTier.ts src/lib/auth/staffTier.test.ts src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx src/app/layout.tsx
git commit -m "feat: expose broadcaster workspace navigation"
```

---

### Task 2: Add neutral team wording to the scouting dashboard

**Files:**
- Modify: `src/components/captain/OpponentScout.tsx`
- Modify: `src/components/captain/OpponentScout.test.tsx`

**Interfaces:**
- Consumes: existing `ScoutSource`.
- Produces: `OpponentScout({ source, perspective?: "opponent" | "team" })`; omitted `perspective` preserves captain behavior.

- [ ] **Step 1: Write failing tests for default and team perspectives**

Keep the existing default assertion for `Opponent`, then add:

```tsx
render(<OpponentScout source={source} perspective="team" />);
expect(screen.getByText("Team")).toBeTruthy();
expect(screen.queryByText("Opponent")).toBeNull();
```

Add an empty-history team case:

```tsx
render(<OpponentScout source={{ ...source, drafts: [] }} perspective="team" />);
expect(screen.getByText("No recorded drafts for this team yet")).toBeTruthy();
```

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
npx vitest run src/components/captain/OpponentScout.test.tsx
```

Expected: FAIL because `perspective` is not accepted and opponent-only copy is rendered.

- [ ] **Step 3: Implement the smallest presentation variant**

Change the signature and derive only the two copy differences:

```tsx
export default function OpponentScout({
  source,
  perspective = "opponent",
}: {
  source: ScoutSource;
  perspective?: "opponent" | "team";
}) {
  const subjectLabel = perspective === "team" ? "Team" : "Opponent";
  const emptyDraftCopy = perspective === "team"
    ? "No recorded drafts for this team yet"
    : "No recorded drafts for this opponent yet";
```

Use `subjectLabel` in the header and `emptyDraftCopy` in the no-drafts state. Do not change scope derivation, in-house mode, captain callers, or existing section order.

- [ ] **Step 4: Run the scouting component and captain-page tests**

Run:

```bash
npx vitest run src/components/captain/OpponentScout.test.tsx src/app/captain/scouting/page.test.tsx
```

Expected: both suites PASS; captain tests still use the default opponent perspective.

- [ ] **Step 5: Commit the neutral scouting presentation**

```bash
git add src/components/captain/OpponentScout.tsx src/components/captain/OpponentScout.test.tsx
git commit -m "feat: support team scouting perspective"
```

---

### Task 3: Derive deterministic role-by-role matchup data

**Files:**
- Create: `src/lib/broadcaster/matchups.ts`
- Create: `src/lib/broadcaster/matchups.test.ts`

**Interfaces:**
- Consumes: `ScoutSource`, `ScoutScope`, `deriveScoutData`, `ROLE_ORDER`, `ROLE_LABELS`, and `scoutKey`.
- Produces:

```ts
export interface BroadcasterMatchupPlayer {
  id: string;
  name: string;
  role: LolRole;
  champions: ChampionCount[];
  totalPicks: number;
  distinctChampions: number;
  gamesSampled: number;
  inhouse: InhousePlayerStats | null;
}

export interface BroadcasterRoleMatchup {
  role: LolRole;
  label: string;
  teamAPlayers: BroadcasterMatchupPlayer[];
  teamBPlayers: BroadcasterMatchupPlayer[];
}

export function deriveBroadcasterMatchups(
  teamA: ScoutSource,
  teamB: ScoutSource,
  scope: ScoutScope,
): BroadcasterRoleMatchup[];
```

- [ ] **Step 1: Write the failing derivation tests**

Build two compact `ScoutSource` fixtures and assert:

```ts
const rows = deriveBroadcasterMatchups(teamA, teamB, "season");
expect(rows.map((row) => row.role)).toEqual(["top", "jungle", "mid", "adc", "support"]);
expect(rows.find((row) => row.role === "mid")?.teamAPlayers.map((player) => player.name))
  .toEqual(["Alpha Mid", "Alpha Sub"]);
expect(rows.find((row) => row.role === "mid")?.teamBPlayers[0]).toMatchObject({
  name: "Beta Mid",
  champions: [{ champion: "Ahri", count: 2 }],
  totalPicks: 2,
  distinctChampions: 1,
  inhouse: { playerId: "beta-mid", games: 3 },
});
expect(rows.find((row) => row.role === "support")?.teamBPlayers).toEqual([]);
```

Add a scope assertion proving `"all"` includes a prior-season pick excluded from `"season"`.

- [ ] **Step 2: Run the new unit test and verify it fails**

Run:

```bash
npx vitest run src/lib/broadcaster/matchups.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure matchup derivation**

Implement a `playersFor` helper that derives the selected scope once per source and maps every roster member:

```ts
function playersFor(source: ScoutSource, scope: ScoutScope): BroadcasterMatchupPlayer[] {
  const data = deriveScoutData(source, scope);
  const pools = new Map(data.playerPools.map((pool) => [scoutKey(pool.playerName), pool]));
  const inhouse = new Map((source.inhousePlayerStats ?? []).map((row) => [row.playerId, row]));

  return source.roster.map((player) => {
    const pool = pools.get(scoutKey(player.displayName));
    return {
      id: player.id,
      name: player.displayName,
      role: player.role,
      champions: pool?.champions.slice(0, 5) ?? [],
      totalPicks: pool?.totalPicks ?? 0,
      distinctChampions: pool?.distinctChampions ?? 0,
      gamesSampled: pool?.gamesSampled ?? 0,
      inhouse: inhouse.get(player.id) ?? null,
    };
  });
}
```

Return exactly one row per `ROLE_ORDER` entry and sort each role group by `name.localeCompare`.

- [ ] **Step 4: Run the derivation and existing scouting derivation tests**

Run:

```bash
npx vitest run src/lib/broadcaster/matchups.test.ts src/lib/scouting/derive.test.ts
```

Expected: PASS with no changes to established scouting calculations.

- [ ] **Step 5: Commit the derivation module**

```bash
git add src/lib/broadcaster/matchups.ts src/lib/broadcaster/matchups.test.ts
git commit -m "feat: derive broadcaster role matchups"
```

---

### Task 4: Render the matchup comparison

**Files:**
- Create: `src/components/broadcaster/BroadcasterMatchups.tsx`
- Create: `src/components/broadcaster/BroadcasterMatchups.test.tsx`

**Interfaces:**
- Consumes: `deriveBroadcasterMatchups(teamA, teamB, scope)`, two `ScoutSource` objects, `ChampionDatum`, and role matchup types from Task 3.
- Produces: `BroadcasterMatchups({ teamA, teamB }: { teamA: ScoutSource; teamB: ScoutSource })`.

- [ ] **Step 1: Write failing rendering and interaction tests**

Render sources with a duplicate Mid and a missing Beta Support. Assert:

```tsx
expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent))
  .toEqual(["Top", "Jungle", "Mid", "ADC", "Support"]);
expect(screen.getByText("Alpha Sub")).toBeTruthy();
expect(screen.getByText("2 picks · 1 champion · 2 games")).toBeTruthy();
expect(screen.getByText("3 in-house games")).toBeTruthy();
expect(screen.getByText("50% WR · 3.17 KDA")).toBeTruthy();
expect(screen.getAllByText("No rostered player")).toHaveLength(1);
```

Change the `Matchup history` select from Current season to All history and assert that the prior-season pick count appears.

- [ ] **Step 2: Run the new component test and verify it fails**

Run:

```bash
npx vitest run src/components/broadcaster/BroadcasterMatchups.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the accessible role grid**

Use local scope state and a labeled select:

```tsx
const [scope, setScope] = useState<ScoutScope>("season");
const matchups = useMemo(
  () => deriveBroadcasterMatchups(teamA, teamB, scope),
  [teamA, teamB, scope],
);
```

Render a header with `Matchup history`, then one section per role. Each section contains two labeled team columns. Each player card renders up to five `ChampionDatum` entries, pool totals, and up to five in-house champion rows. Render `No rostered player` only when that side's role array is empty.

Use the existing copy conventions:

```tsx
`${player.totalPicks} picks · ${player.distinctChampions} ${player.distinctChampions === 1 ? "champion" : "champions"} · ${player.gamesSampled} games`
```

```tsx
`${champion.winrate_pct.toFixed(0)}% WR · ${champion.avg_kda.toFixed(2)} KDA`
```

- [ ] **Step 4: Run matchup component, derivation, and accessibility-adjacent tests**

Run:

```bash
npx vitest run src/components/broadcaster/BroadcasterMatchups.test.tsx src/lib/broadcaster/matchups.test.ts
npx eslint src/components/broadcaster/BroadcasterMatchups.tsx src/components/broadcaster/BroadcasterMatchups.test.tsx
```

Expected: tests PASS and ESLint exits 0.

- [ ] **Step 5: Commit the matchup UI**

```bash
git add src/components/broadcaster/BroadcasterMatchups.tsx src/components/broadcaster/BroadcasterMatchups.test.tsx
git commit -m "feat: add broadcaster matchup comparison"
```

---

### Task 5: Add fixture draft and resilient OBS tools

**Files:**
- Modify: `src/lib/match-draft/rules.ts`
- Modify: `src/lib/match-draft/rules.test.ts`
- Create: `src/components/broadcaster/BroadcasterFixtureHeader.tsx`
- Create: `src/components/broadcaster/BroadcasterFixtureHeader.test.tsx`

**Interfaces:**
- Consumes: `FixtureRow`, `formatKickoff`, and `matchDraftHref`.
- Produces: `matchDraftOverlayHref(fixture: Pick<FixtureRow, "id">): string` and `BroadcasterFixtureHeader({ fixture, twitchUrl })`.

- [ ] **Step 1: Write failing URL-helper and header tests**

Add to `rules.test.ts`:

```ts
expect(matchDraftOverlayHref(fixture)).toBe(
  "/match-draft/fixture-1?overlay=1&bg=transparent",
);
```

In the component test, stub clipboard and origin, then assert:

```tsx
expect(screen.getByRole("link", { name: /open draft/i }).getAttribute("href"))
  .toBe("/match-draft/fixture-1");
fireEvent.click(screen.getByRole("button", { name: /copy obs overlay/i }));
await waitFor(() => expect(writeText).toHaveBeenCalledWith(
  "http://localhost:3000/match-draft/fixture-1?overlay=1&bg=transparent",
));
expect(await screen.findByText("Copied ✓")).toBeTruthy();
```

Add a rejected clipboard case and assert a read-only input labeled `OBS overlay URL` appears with the absolute URL. Also assert Twitch is absent when `twitchUrl` is null.

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
npx vitest run src/lib/match-draft/rules.test.ts src/components/broadcaster/BroadcasterFixtureHeader.test.tsx
```

Expected: FAIL because the helper and component do not exist.

- [ ] **Step 3: Add the shared overlay helper**

Add to `rules.ts`:

```ts
export function matchDraftOverlayHref(fixture: Pick<FixtureRow, "id">): string {
  return `/match-draft/${fixture.id}?overlay=1&bg=transparent`;
}
```

Do not refactor the large `MatchDraftBoard` in this task; the new broadcaster component consumes the helper immediately, and migrating the board's private button is outside this feature's required behavior.

- [ ] **Step 4: Implement the fixture header and clipboard fallback**

Keep `copyState` as `"idle" | "copied" | "failed"`. On click:

```tsx
const path = matchDraftOverlayHref(fixture);
const absoluteUrl = new URL(path, window.location.origin).toString();
try {
  await navigator.clipboard.writeText(absoluteUrl);
  setCopyState("copied");
} catch {
  setFallbackUrl(absoluteUrl);
  setCopyState("failed");
}
```

Render team names, `formatKickoff(fixture.scheduled_at)`, `Bo{fixture.best_of}`, division/stage, an `Open draft` link, the copy button, optional Twitch link, and this failure control:

```tsx
{copyState === "failed" && (
  <label className="flex flex-col gap-1 text-xs text-steel">
    OBS overlay URL
    <input aria-label="OBS overlay URL" readOnly value={fallbackUrl} className="input-brand px-2 py-2" />
  </label>
)}
```

- [ ] **Step 5: Run the targeted tests and lint**

Run:

```bash
npx vitest run src/lib/match-draft/rules.test.ts src/components/broadcaster/BroadcasterFixtureHeader.test.tsx
npx eslint src/lib/match-draft/rules.ts src/components/broadcaster/BroadcasterFixtureHeader.tsx src/components/broadcaster/BroadcasterFixtureHeader.test.tsx
```

Expected: tests PASS and ESLint exits 0.

- [ ] **Step 6: Commit the broadcast tools**

```bash
git add src/lib/match-draft/rules.ts src/lib/match-draft/rules.test.ts src/components/broadcaster/BroadcasterFixtureHeader.tsx src/components/broadcaster/BroadcasterFixtureHeader.test.tsx
git commit -m "feat: add broadcaster fixture tools"
```

---

### Task 6: Compose the three-tab broadcaster workspace

**Files:**
- Create: `src/components/broadcaster/BroadcasterWorkspace.tsx`
- Create: `src/components/broadcaster/BroadcasterWorkspace.test.tsx`

**Interfaces:**
- Consumes: `BroadcasterFixtureHeader`, `BroadcasterMatchups`, `OpponentScout`, `FixtureRow`, `HomepageFeaturedSettings`, `LeagueView`, and two `ScoutSource` objects.
- Produces:

```ts
export interface BroadcasterWorkspaceProps {
  league: LeagueView;
  fixture: FixtureRow;
  settings: HomepageFeaturedSettings;
  teamA: ScoutSource;
  teamB: ScoutSource;
}
```

- [ ] **Step 1: Write failing tab and league-link tests**

Mock the three child presentations so the test focuses on composition. Assert the default state and interactions:

```tsx
expect(screen.getByRole("tab", { name: /Alpha scouting/i }).getAttribute("aria-selected")).toBe("true");
expect(screen.getByText("team scout: Alpha")).toBeTruthy();

fireEvent.click(screen.getByRole("tab", { name: /^Matchups$/ }));
expect(screen.getByText("matchups: Alpha vs Beta")).toBeTruthy();

fireEvent.click(screen.getByRole("tab", { name: /Beta scouting/i }));
expect(screen.getByText("team scout: Beta")).toBeTruthy();
```

Assert the league links are `/broadcaster?league=premier` and `/broadcaster?league=academy`, and the selected link has `aria-current="page"`.

- [ ] **Step 2: Run the workspace test and verify it fails**

Run:

```bash
npx vitest run src/components/broadcaster/BroadcasterWorkspace.test.tsx
```

Expected: FAIL because the workspace component does not exist.

- [ ] **Step 3: Implement the workspace shell**

Use a discriminated tab state:

```tsx
type WorkspaceTab = "team-a" | "matchups" | "team-b";
const [tab, setTab] = useState<WorkspaceTab>("team-a");
```

Render `BroadcasterFixtureHeader`, the Premier/Academy links, and a `role="tablist"` with three buttons. Each button receives a stable `id`, `aria-controls`, and `aria-selected`; the visible panel uses `role="tabpanel"` and matching `aria-labelledby`.

Render team panels with the neutral perspective:

```tsx
<OpponentScout source={teamA} perspective="team" />
<BroadcasterMatchups teamA={teamA} teamB={teamB} />
<OpponentScout source={teamB} perspective="team" />
```

- [ ] **Step 4: Run workspace, scouting, and matchup tests**

Run:

```bash
npx vitest run src/components/broadcaster/BroadcasterWorkspace.test.tsx src/components/broadcaster/BroadcasterMatchups.test.tsx src/components/captain/OpponentScout.test.tsx
npx eslint src/components/broadcaster/BroadcasterWorkspace.tsx src/components/broadcaster/BroadcasterWorkspace.test.tsx
```

Expected: all suites PASS and ESLint exits 0.

- [ ] **Step 5: Commit the workspace composition**

```bash
git add src/components/broadcaster/BroadcasterWorkspace.tsx src/components/broadcaster/BroadcasterWorkspace.test.tsx
git commit -m "feat: compose broadcaster scouting workspace"
```

---

### Task 7: Load the featured fixture and both scouting sources

**Files:**
- Create: `src/lib/broadcaster/workspace.ts`
- Create: `src/lib/broadcaster/workspace.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient`, `LeagueView`, `fetchCaptainContext`, `fetchHomepageSchedule`, `fetchHomepageFeaturedSettings`, `selectHomepageFeaturedFixture`, `filterAcademyFixtures`, `academyTeamNames`, `fetchMyRoster`, `fetchScoutingHistory`, `fetchInhousePlayerStats`, and `matchTeamId`.
- Produces:

```ts
export interface BroadcasterFixtureContext {
  league: LeagueView;
  season: string;
  teams: LeagueTeam[];
  fixture: FixtureRow | null;
  settings: HomepageFeaturedSettings;
}

export interface BroadcasterScoutingData {
  teamA: ScoutSource;
  teamB: ScoutSource;
}

export async function resolveBroadcasterFixture(
  supabase: SupabaseClient,
  league: LeagueView,
): Promise<BroadcasterFixtureContext>;

export async function loadBroadcasterScouting(
  supabase: SupabaseClient,
  context: BroadcasterFixtureContext,
): Promise<BroadcasterScoutingData | null>;
```

- [ ] **Step 1: Write failing fixture-resolution tests**

Mock the imported fetchers. Verify Premier calls `fetchHomepageSchedule()` without a scope and passes the configured ID to `selectHomepageFeaturedFixture`. Verify Academy passes a scope callback that excludes non-Academy fixtures. Include an automatic fallback case where settings return `fixtureId: null` and the selector returns the first active fixture.

Assert the resolved context:

```ts
expect(await resolveBroadcasterFixture(supabase, "premier")).toMatchObject({
  league: "premier",
  season: "S5",
  fixture: { id: "featured-1" },
  settings: { fixtureId: "featured-1", twitchUrl: "https://www.twitch.tv/fpl" },
});
```

- [ ] **Step 2: Write failing shared scouting-load tests**

Set both fixture names to active teams and assert:

```ts
const data = await loadBroadcasterScouting(supabase, context);
expect(fetchScoutingHistory).toHaveBeenCalledTimes(1);
expect(fetchScoutingHistory).toHaveBeenCalledWith(supabase, {
  league: "premier",
  leagueTeamNames: ["Alpha", "Beta"],
});
expect(fetchMyRoster).toHaveBeenCalledWith(supabase, "alpha-id", "S5", "premier");
expect(fetchMyRoster).toHaveBeenCalledWith(supabase, "beta-id", "S5", "premier");
expect(fetchInhousePlayerStats).toHaveBeenCalledTimes(1);
expect(data?.teamA.opponentName).toBe("Alpha");
expect(data?.teamB.opponentName).toBe("Beta");
```

Add cases for `fixture: null` returning `null`, and an unmatched fixture team producing an empty roster without suppressing history.

- [ ] **Step 3: Run the server-helper tests and verify they fail**

Run:

```bash
npx vitest run src/lib/broadcaster/workspace.test.ts
```

Expected: FAIL because the server orchestration module does not exist.

- [ ] **Step 4: Implement featured-fixture resolution**

Fetch captain context first because it supplies league-scoped active teams and the correct Premier/Academy season. Then load schedule and settings concurrently:

```ts
const [schedule, settings] = await Promise.all([
  league === "academy"
    ? fetchHomepageSchedule((fixtures) =>
        filterAcademyFixtures(fixtures, academyTeamNames(captain.teams)))
    : fetchHomepageSchedule(),
  fetchHomepageFeaturedSettings(league),
]);
```

Then call:

```ts
const fixture = selectHomepageFeaturedFixture(schedule.fixtures, settings.fixtureId);
```

- [ ] **Step 5: Implement one-history, one-in-house scouting loading**

Resolve both team IDs with `matchTeamId`. Load history and both available rosters concurrently. Convert roster players to `{ id, displayName, role }`, combine both rosters, and call `fetchInhousePlayerStats` once. Split the returned rows by each roster's player-ID set.

Construct both sources with the same history and featured fixture:

```ts
const source = (
  teamName: string,
  roster: ScoutRosterPlayer[],
  inhousePlayerStats: InhousePlayerStats[],
): ScoutSource => ({
  ...history,
  opponentName: teamName,
  teamName,
  currentSeason: context.season,
  nextFixture: context.fixture!,
  roster,
  inhousePlayerStats,
});
```

Use an empty roster for an unmatched team. Return `null` only when no fixture exists or either fixture team name is empty.

- [ ] **Step 6: Run the server-helper and existing query tests**

Run:

```bash
npx vitest run src/lib/broadcaster/workspace.test.ts src/lib/scouting/queries.test.ts src/lib/home/schedule.test.ts
npx eslint src/lib/broadcaster/workspace.ts src/lib/broadcaster/workspace.test.ts
```

Expected: all tests PASS and ESLint exits 0.

- [ ] **Step 7: Commit the data orchestration**

```bash
git add src/lib/broadcaster/workspace.ts src/lib/broadcaster/workspace.test.ts
git commit -m "feat: load broadcaster featured scouting data"
```

---

### Task 8: Add the protected broadcaster route and documentation

**Files:**
- Create: `src/app/broadcaster/page.tsx`
- Create: `src/app/broadcaster/page.test.tsx`
- Modify: `README.md`
- Modify: `docs/backend.md`

**Interfaces:**
- Consumes: `canAccessBroadcaster`, `resolveLeagueView`, `resolveBroadcasterFixture`, `loadBroadcasterScouting`, and `BroadcasterWorkspace`.
- Produces: the `/broadcaster?league=premier|academy` server route.

- [ ] **Step 1: Write the failing page access-matrix tests**

Mock `fetchStaffTier`, `redirect`, fixture/scouting loaders, and `BroadcasterWorkspace`. Cover all five cases:

```ts
it.each([
  [{ isAdmin: false, isOwner: false, isBroadcaster: true }, false],
  [{ isAdmin: false, isOwner: true, isBroadcaster: false }, false],
  [{ isAdmin: true, isOwner: false, isBroadcaster: false }, true],
  [{ isAdmin: false, isOwner: false, isBroadcaster: false }, true],
])("applies the broadcaster access rule", async (tier, redirected) => {
  fetchStaffTier.mockResolvedValue(tier);
  if (redirected) await expect(BroadcasterPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirected");
  else render(await BroadcasterPage({ searchParams: Promise.resolve({}) }));
});
```

Represent signed-out as the same false staff tier because `fetchStaffTier` fails closed.

- [ ] **Step 2: Write failing league, empty, and partial-error tests**

Assert `league=academy` calls `resolveBroadcasterFixture` with `"academy"`. Add:

```tsx
expect(screen.getByText("No Academy featured match is available.")).toBeTruthy();
expect(screen.getByRole("link", { name: /choose the featured matchup/i }).getAttribute("href"))
  .toBe("/admin");
```

Make `loadBroadcasterScouting` reject while fixture resolution succeeds and assert the fixture header remains rendered with `Scouting data is temporarily unavailable.`. Add the same assertion when `loadBroadcasterScouting` returns `null` for a fixture with an unresolved team name. Accomplish this by rendering `BroadcasterFixtureHeader` directly in the unavailable/error branch rather than discarding fixture context.

- [ ] **Step 3: Run the page test and verify it fails**

Run:

```bash
npx vitest run src/app/broadcaster/page.test.tsx
```

Expected: FAIL because the route does not exist.

- [ ] **Step 4: Implement authorization and URL league selection**

Use an explicit App Router prop type:

```ts
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function BroadcasterPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createServerSupabase();
  const tier = await fetchStaffTier(supabase);
  if (!canAccessBroadcaster(tier)) redirect("/");
  const league = resolveLeagueView((await searchParams).league);
```

Resolve fixture context next. If no fixture exists, render the page heading, league links, league-specific message, and `/admin` link.

- [ ] **Step 5: Implement successful and partial-error rendering**

Wrap only `loadBroadcasterScouting` in `try/catch`. Treat its `null` result as the safe unavailable state. On a non-null success, render:

```tsx
<BroadcasterWorkspace
  league={league}
  fixture={context.fixture}
  settings={context.settings}
  teamA={scouting.teamA}
  teamB={scouting.teamB}
/>
```

On failure, log `console.error("Unable to load broadcaster scouting", error)`, render `BroadcasterFixtureHeader` with the resolved fixture, and show the safe scouting error copy. This preserves draft/OBS/Twitch tools.

- [ ] **Step 6: Update repository documentation**

In `README.md` under Roles and access, add:

```md
- **Broadcasters** can open the private broadcaster workspace and maintain the Premier/Academy featured-matchup presentation; owners inherit broadcaster workspace access, while admins do not.
```

In `docs/backend.md` authorization, document `profiles.is_broadcaster`, the owner inheritance rule, and that `/broadcaster` uses existing authenticated reads. Add the broadcaster workspace to the domain map as a read-only composition of `homepage_featured_settings`, `fixtures`, rosters, match drafts, and in-house stats.

- [ ] **Step 7: Run all broadcaster-focused tests**

Run:

```bash
npx vitest run \
  src/app/broadcaster/page.test.tsx \
  src/components/broadcaster/BroadcasterWorkspace.test.tsx \
  src/components/broadcaster/BroadcasterFixtureHeader.test.tsx \
  src/components/broadcaster/BroadcasterMatchups.test.tsx \
  src/lib/broadcaster/workspace.test.ts \
  src/lib/broadcaster/matchups.test.ts \
  src/components/captain/OpponentScout.test.tsx \
  src/components/SiteNavigation.test.tsx \
  src/lib/auth/staffTier.test.ts \
  src/lib/home/schedule.test.ts \
  src/lib/match-draft/rules.test.ts
```

Expected: every targeted suite PASS.

- [ ] **Step 8: Run broader verification**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all commands exit 0. If `npm run build` reports a Next.js API mismatch, re-read the three Next.js 16.3 guides listed in Global Constraints and correct the implementation before claiming completion.

- [ ] **Step 9: Inspect the final diff for scope and unrelated files**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~7..HEAD
```

Expected: broadcaster/scouting/navigation/docs changes only, aside from the preserved pre-existing working-tree changes named in Global Constraints; no whitespace errors.

- [ ] **Step 10: Commit the route and documentation**

```bash
git add src/app/broadcaster/page.tsx src/app/broadcaster/page.test.tsx README.md docs/backend.md
git commit -m "feat: add broadcaster match workspace"
```

---

## Completion Checklist

- [ ] Owner and broadcaster can access `/broadcaster`; admin-only, ordinary, and signed-out visitors cannot.
- [ ] Navigation visibility matches the same access rule without changing existing Admin visibility.
- [ ] Premier and Academy use the exact homepage featured-fixture resolution and are bookmarkable by query parameter.
- [ ] Team A, Matchups, and Team B tabs render without client refetches.
- [ ] Matchups retain duplicate-role players and show deterministic missing-role states.
- [ ] Draft, transparent OBS, and optional Twitch links are correct.
- [ ] Clipboard rejection exposes the URL instead of reporting success.
- [ ] Missing fixture, roster, draft history, in-house stats, and scouting-query failures degrade independently.
- [ ] No service-role client, new table, or duplicate fixture setting was introduced.
- [ ] Targeted tests, lint, full Vitest, and production build all pass.
