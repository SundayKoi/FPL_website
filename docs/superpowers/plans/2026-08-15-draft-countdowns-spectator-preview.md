# Draft Countdowns and Spectator Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-draft Eastern Time schedules, Draft Central countdown cards for upcoming Season 5 and Academy drafts, and a read-only setup spectator preview that becomes the live draft board at launch.

**Architecture:** Store an optional `starts_at` timestamp on each draft. Use small shared date/countdown helpers for hydration-safe client timers and Eastern Time formatting. Keep the existing `/draft/:id` data source and live board, adding a dedicated setup-preview branch with no mutations. Extend the existing admin draft setup editor with a validated schedule form.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres migrations, Tailwind CSS v4, Vitest, Testing Library, Playwright.

## Global Constraints

- Store scheduled times as `timestamptz` and expose them in TypeScript as `string | null`.
- Admin input and public display use the `America/New_York` timezone.
- Scheduled start does not automatically start a draft; admins still explicitly invoke `start_draft`.
- Setup previews are read-only and must not render bid, nomination, or other mutating controls.
- Preserve unrelated working-tree changes and only stage files belonging to this feature.
- Read the relevant Next.js 16 guide in `node_modules/next/dist/docs/` before writing application code.
- Follow test-first development: each production behavior is preceded by a failing test.

---

### Task 1: Add the draft schedule data model and time helpers

**Files:**
- Create: `supabase/migrations/20260815000002_draft_start_time.sql`
- Create: `src/lib/draft/schedule.ts`
- Create: `src/lib/draft/schedule.test.ts`
- Modify: `src/lib/draft/types.ts`
- Modify: `src/lib/time.ts`
- Modify: draft fixture objects in existing `src/**/*.test.tsx` and `src/**/*.test.ts` files only where TypeScript requires `starts_at`

**Interfaces:**
- `Draft.starts_at: string | null`
- `formatEasternDateTime(value: string | null): string`
- `formatEasternInputValue(value: string | null): string`
- `parseEasternInputValue(value: string): { iso: string } | { error: string }`
- `getScheduleState(startsAt: string | null, now: Date): "unscheduled" | "upcoming" | "started"`

- [ ] **Step 1: Read the Next.js 16 date/client guidance**

Run:

```bash
sed -n '1,220p' node_modules/next/dist/docs/01-app/03-api-reference/01-directives/01-use-client.md
sed -n '1,220p' node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-server.md
```

Expected: confirm the client/server boundary rules before adding a client countdown or admin editor change.

- [ ] **Step 2: Write failing time-helper tests**

Add tests showing that `formatEasternDateTime` uses `America/New_York` across standard/daylight offsets, `formatEasternInputValue` produces the `datetime-local` shape, `parseEasternInputValue` rejects malformed values, and `getScheduleState` returns the three states.

```ts
it("formats a daylight-saving start in Eastern Time", () => {
  expect(formatEasternDateTime("2026-08-16T01:00:00.000Z")).toContain("Saturday, August 15");
  expect(formatEasternDateTime("2026-08-16T01:00:00.000Z")).toContain("9:00 PM");
});

it("rejects a datetime-local value that is not complete", () => {
  expect(parseEasternInputValue("2026-08-16")).toEqual({ error: "Enter a date and time." });
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx vitest run src/lib/draft/schedule.test.ts
```

Expected: FAIL because the schedule helpers do not exist yet.

- [ ] **Step 4: Implement the migration, type field, and helpers**

Create the migration:

```sql
alter table public.drafts add column if not exists starts_at timestamptz;
```

Add `starts_at: string | null` to `Draft`. Implement the helpers with `Intl.DateTimeFormat` and the `America/New_York` timezone. Parse `datetime-local` values as Eastern wall-clock time, including the correct daylight-saving offset, and return an ISO timestamp suitable for Supabase. Keep empty input handling in the form layer so the parser only receives a non-empty value.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest run src/lib/draft/schedule.test.ts
```

Expected: PASS with no console warnings.

- [ ] **Step 6: Run typecheck-adjacent tests and inspect the migration**

Run:

```bash
npx vitest run src/lib/draft src/lib/home src/hooks
```

Expected: PASS; no fixture or Draft type errors remain. Confirm the migration only adds the nullable column.

---

### Task 2: Build the reusable live schedule countdown card

**Files:**
- Create: `src/components/draft/DraftScheduleCountdown.tsx`
- Create: `src/components/draft/DraftScheduleCountdown.test.tsx`
- Modify: `src/lib/home/seasonState.ts` only if a shared countdown-part helper is extracted without changing existing behavior

**Interfaces:**
- `DraftScheduleCountdown({ startsAt, label, compact? }: { startsAt: string | null; label?: string; compact?: boolean }): JSX.Element`

- [ ] **Step 1: Write failing component tests**

Use fake timers and a fixed `Date.now` to assert:

```tsx
it("shows an upcoming schedule as days, hours, minutes, and seconds", () => {
  vi.setSystemTime(new Date("2026-08-15T18:58:29-04:00"));
  render(<DraftScheduleCountdown startsAt="2026-08-15T20:00:00-04:00" label="Season 5 Draft" />);
  expect(screen.getByText("Season 5 Draft")).toBeInTheDocument();
  expect(screen.getByText("01")).toBeInTheDocument();
});

it("shows live now after the scheduled time", () => {
  vi.setSystemTime(new Date("2026-08-16T00:00:00-04:00"));
  render(<DraftScheduleCountdown startsAt="2026-08-15T20:00:00-04:00" />);
  expect(screen.getByText(/Live now/i)).toBeInTheDocument();
});

it("shows not scheduled when no timestamp is configured", () => {
  render(<DraftScheduleCountdown startsAt={null} />);
  expect(screen.getByText(/Not scheduled/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/components/draft/DraftScheduleCountdown.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the countdown component**

Use `useSyncExternalStore` with a server snapshot of `0`, matching the hydration-safe pattern in `PreseasonCountdown`. Render accessible text and four numeric units for future schedules, a `Live now` state at zero/past, and `Not scheduled` for null. Use the existing brand classes and keep the compact variant suitable for cards.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run src/components/draft/DraftScheduleCountdown.test.tsx
```

Expected: PASS.

---

### Task 3: Redesign Draft Central around upcoming drafts

**Files:**
- Create: `src/components/draft/UpcomingDraftCard.tsx`
- Create: `src/components/draft/UpcomingDraftCard.test.tsx`
- Modify: `src/app/draft/page.tsx`
- Modify: `src/components/draft/DraftDirectory.tsx`
- Modify: `src/components/draft/DraftDirectory.test.tsx` if present; otherwise create it

**Interfaces:**
- `UpcomingDraftCard({ draft }: { draft: Draft }): JSX.Element`
- `DraftDirectory({ drafts }: { drafts: Draft[] }): JSX.Element`

- [ ] **Step 1: Write failing card and directory tests**

Assert that scheduled setup drafts render a countdown and schedule, unscheduled drafts remain in the list, and all drafts retain board links. Include two records named `FPL Season 5` and `Academy Draft` to prove both upcoming cards can coexist.

```tsx
it("renders both configured upcoming drafts with independent countdowns", () => {
  render(<DraftDirectory drafts={[seasonFiveDraft, academyDraft]} />);
  expect(screen.getByText("FPL Season 5")).toBeInTheDocument();
  expect(screen.getByText("Academy Draft")).toBeInTheDocument();
  expect(screen.getAllByText(/Draft start/i)).toHaveLength(2);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run src/components/draft/DraftDirectory.test.tsx src/components/draft/UpcomingDraftCard.test.tsx
```

Expected: FAIL on the new upcoming-card expectations.

- [ ] **Step 3: Implement the Draft Central layout**

Pass all drafts from the server page to the directory. Split scheduled setup drafts into an upcoming section, sort by `starts_at`, and keep the complete draft list below. Add polished branded cards with status, scheduled Eastern display, countdown, and links. Do not hard-code draft IDs or event names; Season 5 and Academy are data values.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/components/draft/DraftDirectory.test.tsx src/components/draft/UpcomingDraftCard.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run existing navigation and app tests**

Run:

```bash
npx vitest run src/components/SiteNavigation.test.tsx src/app/layout.test.tsx
```

Expected: PASS; no route or navigation regressions.

---

### Task 4: Add admin schedule configuration

**Files:**
- Create: `src/components/admin/DraftScheduleEditor.tsx`
- Create: `src/components/admin/DraftScheduleEditor.test.tsx`
- Modify: `src/components/admin/DraftSetupEditor.tsx`

**Interfaces:**
- `DraftScheduleEditor({ draft, onSaved }: { draft: Draft; onSaved: (startsAt: string | null) => void }): JSX.Element`

- [ ] **Step 1: Write failing admin editor tests**

Mock only the Supabase client boundary and test actual form behavior:

```tsx
it("saves an Eastern Time start and reports success", async () => {
  render(<DraftScheduleEditor draft={setupDraft} onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/Draft start/i), { target: { value: "2026-08-16T20:00" } });
  fireEvent.click(screen.getByRole("button", { name: /Save schedule/i }));
  await waitFor(() => expect(query.update).toHaveBeenCalledWith({ starts_at: expect.any(String) }));
  expect(screen.getByText(/Schedule saved/i)).toBeInTheDocument();
});

it("can clear a configured schedule", async () => {
  render(<DraftScheduleEditor draft={{ ...setupDraft, starts_at: "2026-08-16T00:00:00.000Z" }} onSaved={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Clear schedule/i }));
  await waitFor(() => expect(query.update).toHaveBeenCalledWith({ starts_at: null }));
});
```

Also cover invalid input and ensure no update is attempted.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run src/components/admin/DraftScheduleEditor.test.tsx
```

Expected: FAIL because the editor does not exist.

- [ ] **Step 3: Implement the admin editor**

Render a `datetime-local` field prefilled from `starts_at`, an Eastern Time note, Save and Clear controls, and inline status/error text. Use the browser Supabase client to update only the current draft row by ID. Disable controls while saving. Call `onSaved` after a successful update so the parent draft state and preview update immediately. Render the editor only for setup drafts.

- [ ] **Step 4: Integrate with `DraftSetupEditor`**

Place the schedule editor above team/player setup. Update the local `draft` state from `onSaved`; retain the existing refetch path for other setup changes and preserve the start-draft flow.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/components/admin/DraftScheduleEditor.test.tsx src/components/admin/DraftListClient.test.tsx
```

Expected: PASS.

---

### Task 5: Create the setup spectator preview

**Files:**
- Create: `src/components/draft/DraftSetupPreview.tsx`
- Create: `src/components/draft/DraftSetupPreview.test.tsx`
- Modify: `src/components/draft/DraftBoard.tsx`
- Modify: `src/components/draft/DraftHeader.tsx` if needed to support the Preview treatment without changing live statuses

**Interfaces:**
- `DraftSetupPreview({ draft, teams, players }: { draft: Draft; teams: Team[]; players: Player[] }): JSX.Element`

- [ ] **Step 1: Write failing preview tests**

Assert that setup preview renders schedule/countdown, team order and budgets, player pool roles/ranks, and preview copy. Assert that no `Bid`, `Nominate`, or captain-control buttons appear.

```tsx
it("renders a read-only scheduled preview without draft controls", () => {
  render(<DraftSetupPreview draft={setupDraft} teams={[team]} players={[player]} />);
  expect(screen.getByText(/spectator preview/i)).toBeInTheDocument();
  expect(screen.getByText(team.name)).toBeInTheDocument();
  expect(screen.getByText(player.display_name)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /bid|nominate/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run src/components/draft/DraftSetupPreview.test.tsx
```

Expected: FAIL because the preview does not exist.

- [ ] **Step 3: Implement the read-only preview**

Build the preview from existing `Team` and `Player` data. Reuse the visual language of `TeamColumn` and `PlayerPool` where practical, but keep the component read-only and focused. Include a central empty-stage message, team cards ordered by `nomination_position`, empty roster-slot indicators, and a role-grouped available-player list. Link back to Draft Central and show the schedule countdown.

- [ ] **Step 4: Integrate the setup branch in `DraftBoard`**

Replace the current setup empty-state section with `DraftSetupPreview`. Keep the existing loading/not-found path, live/paused behavior, complete behavior, chat behavior, and toast behavior unchanged. Ensure setup renders no `AdminStrip`, `BidControls`, `NominationPicker`, or draft chat mutations.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/components/draft/DraftSetupPreview.test.tsx src/components/draft/DraftBoard.test.tsx
```

Expected: PASS.

---

### Task 6: Verify the complete feature and polish responsive behavior

**Files:**
- Modify: only files required by failing verification or accessibility findings from Tasks 1–5
- Test: `e2e/draft.spec.ts` if the seeded setup state supports a pre-live assertion

- [ ] **Step 1: Add the setup e2e assertion**

Before the seeded e2e draft is started, assert that `/draft/:id` contains the spectator-preview copy and does not expose a bid control. Keep the existing countdown and auction assertions intact.

- [ ] **Step 2: Run the complete Vitest suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no new warnings.

- [ ] **Step 4: Run the draft Playwright suite**

Run:

```bash
npm run e2e -- e2e/draft.spec.ts
```

Expected: PASS, including the existing live-draft behavior.

- [ ] **Step 5: Run a production build**

Run:

```bash
npm run build
```

Expected: PASS with no server/client boundary or TypeScript errors.

- [ ] **Step 6: Inspect the final diff and manually verify key states**

Run:

```bash
git diff --check
git status --short
```

Verify in the browser at minimum: two upcoming countdown cards, unscheduled draft handling, admin save/clear, setup preview at `/draft/:id`, no setup mutations, and unchanged live board behavior. Stage only feature files after review.
