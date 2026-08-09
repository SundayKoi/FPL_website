# Board Layout + Custom Bids Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit 12 teams on the draft board (teams grid below the pool, own team pinned left for captains) and make custom bids first-class (stale-amount fix + labeled prominent input).

**Architecture:** Rearrange `DraftBoard`'s live-grid JSX (components unchanged, reused); `BidControls` gets a render-phase amount resync keyed on `lot.id`/`lot.current_bid`. No hook/engine/RPC changes.

**Tech Stack:** Existing Next.js 16 + Tailwind v4 brand system (`label-dash`, `card-brand`, tokens).

**Spec:** `docs/superpowers/specs/2026-08-09-board-layout-bids-design.md` (canonical).

## Global Constraints

- No changes to: RPCs, hooks' interfaces, `derive.ts`, routes, existing test-sensitive copy (`Bid {n}` quick button, `Nominate (opens at {n})`, blocked-reason strings, `{team} bid {n} on {player}`, "Waiting for … to nominate…"). NEW visible text allowed only as specced: `TEAMS` heading, `YOUR BID` label, `min {n} · max {n}` hint.
- `react-hooks/set-state-in-effect` is a lint ERROR — use render-phase state adjustment, no eslint-disable.
- Gates: `npm run build` clean, `npm run lint` exit 0, `npm test` 15/15, `npm run e2e` green.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Layout restructure + custom-bid fix

**Files:**
- Modify: `src/components/draft/DraftBoard.tsx`, `src/components/draft/BidControls.tsx`, (only if needed for grid classes) `src/components/draft/FinalRosters.tsx`

**Interfaces:**
- Consumes: `TeamColumn`, `PlayerPool`, `BidFeed`, `CenterStage` unchanged; `myTeam` from `useDraftState`; `maxBid` from `derive.ts`.
- Produces: no new exports.

- [ ] **Step 1: DraftBoard layout**

Inside the live/paused branch: wrap main content in a flex row — left rail rendered only when `myTeam`:

```tsx
<div className="flex gap-4">
  {myTeam && (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-20">
        <TeamColumn team={myTeam} players={players}
          isNominator={draft.current_nominator_team_id === myTeam.id} isMyTeam />
      </div>
    </aside>
  )}
  <div className="min-w-0 flex-1 space-y-4">
    {/* CenterStage + BidFeed row (existing) */}
    {/* captain ribbon + controls (existing) */}
    {/* PlayerPool full width */}
    <section>
      <h2 className="label-dash mb-2">TEAMS</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {teams.map((t) => <TeamColumn key={t.id} ... />)}   {/* existing props incl. isMyTeam */}
      </div>
    </section>
  </div>
</div>
```

(Exact surrounding structure per the current file; keep paused/disconnect banners, lobby/complete branches, and all conditions as-is. `FinalRosters`: adopt the same responsive grid columns if it currently uses the old side-by-side layout.)

- [ ] **Step 2: BidControls resync + prominence**

Render-phase adjust (pattern from `useCountdown`):

```tsx
const quick = lot.current_bid + 1;
const [amount, setAmount] = useState<number>(quick);
const [prevKey, setPrevKey] = useState(`${lot.id}:${lot.current_bid}`);
const key = `${lot.id}:${lot.current_bid}`;
if (key !== prevKey) {
  const isNewLot = !prevKey.startsWith(lot.id);
  setPrevKey(key);
  if (isNewLot || amount < quick) setAmount(quick);
}
```

Wrap the input with a `label-dash`-styled `YOUR BID` label and a steel hint `min {quick} · max {maxBid(team, players)}`; enlarge input (`w-28 p-3 text-lg font-display not-italic`). Quick-bid button, `place()` logic, NaN guard, and all copy unchanged.

- [ ] **Step 3: Gates**

`npm run build`, `npm run lint`, `npm test`, `npm run e2e` (e2e must stay green — it doesn't reference team-column placement; confirm).

- [ ] **Step 4: Visual check**

Scratch Playwright: captain view (rail pinned, TEAMS grid below pool, YOUR BID field) and spectator view (no rail, full-width). Seed has only 2 teams — ALSO verify the grid classes cope by temporarily inserting 10 extra teams via psql into the demo draft (roll back after screenshot: delete the extra teams) OR just eyeball the 2-team grid + class breakpoints. READ screenshots.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: 12-team board layout and first-class custom bids"
```
