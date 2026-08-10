# Task 3 Report: Compose Draft Central into the new home and validate it

## Implementation

- Updated `src/app/page.tsx` to compose the existing `LeagueHub` wrapper around the server-rendered draft list.
- Preserved the existing `createServerSupabase()` call, `.from("drafts").select("*").order("created_at", { ascending: false })` query, and `(data as Draft[]) ?? []` cast exactly.
- Replaced the previous standalone page shell with a `section` using:
  - `id="draft-central"`
  - `className="scroll-mt-24 pt-16"`
  - `aria-labelledby="draft-central-title"`
- Retained:
  - `/admin` link
  - `No drafts yet.` empty-state copy
  - each draft link as ``/draft/${draft.id}``
  - unmodified `draft.status` text
  - `VIEW BOARD →` copy
- Kept the existing visual system and only adjusted list layout to `grid gap-4 md:grid-cols-2` so the draft cards sit comfortably inside the new hub width.

## Changed files

- Modified: `src/app/page.tsx`
- Added: `.superpowers/sdd/2026-08-10-broadcast-hub-landing-page/task-3-report.md`

## Test / TDD evidence

Task 3’s brief explicitly used the existing `LeagueHub` child-content test as the regression guard before integration. I followed that order:

1. Ran the existing component test first to confirm `LeagueHub` preserves child content.
2. Implemented the page integration in `src/app/page.tsx`.
3. Ran the full automated validation suite afterward.

### Pre-integration regression guard

Command:

```bash
/Users/matthewwolanski/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run src/components/home/LeagueHub.test.tsx
```

Result:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    956ms
```

### Full suite

Command:

```bash
PATH="/Users/matthewwolanski/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm test
```

Result:

```text
Test Files  7 passed (7)
Tests       21 passed (21)
Duration    1.24s
```

## Command outputs

### Lint

Command:

```bash
PATH="/Users/matthewwolanski/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run lint
```

Result: exit 0 with one existing warning outside Task 3 scope.

```text
/Users/matthewwolanski/Dev/FPL/FPL_website/src/app/login/page.tsx
  43:20  warning  Do not use `location.href` to navigate to internal Next.js pages. Use `redirect()` in the render phase, or `useRouter().push()` in Client Components' event handlers instead. See: https://nextjs.org/docs/messages/no-location-assign-relative-destination  @next/next/no-location-assign-relative-destination

✖ 1 problem (0 errors, 1 warning)
```

### Build

Attempt 1 command:

```bash
PATH="/Users/matthewwolanski/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run build
```

Attempt 1 result: blocked in sandbox when `next/font` tried to fetch Google Fonts.

```text
Failed to fetch Chakra Petch from Google Fonts.
Failed to fetch Saira from Google Fonts.
```

Attempt 2 command (outside sandbox):

```bash
PATH="/Users/matthewwolanski/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run build
```

Attempt 2 result: environment/tooling blocker unrelated to Task 3 page logic.

```text
FATAL: An unexpected Turbopack error occurred.
Failed to write app endpoint /page
...
creating new process
binding to a port
Operation not permitted (os error 1)
```

## Visual inspection evidence / blocker

### Dev server

Sandboxed command:

```bash
PATH="/Users/matthewwolanski/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run dev
```

Sandboxed result:

```text
Failed to start server
Error: listen EPERM: operation not permitted 0.0.0.0:3000
```

Retried outside sandbox; server started successfully at `http://localhost:3000`.

### Blocker encountered during desktop/mobile inspection

I attempted live inspection of `/` in the in-app browser, but the page never rendered the homepage UI because the app crashed on the server before the route could load.

Observed runtime error:

```text
Your project's URL and Key are required to create a Supabase client!
```

Relevant runtime locations:

- `src/lib/supabase/server.ts:6`
- `src/components/AuthButton.tsx:5`
- `src/app/page.tsx:7`

Supporting environment evidence:

- `rg --files -g '.env*'` returned only `.env.example`
- shell check reported:
  - `NEXT_PUBLIC_SUPABASE_URL_MISSING`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY_MISSING`

Because the route crashed before rendering, I could not complete the prescribed visual checks for:

- desktop hero / Twitch feature stacking
- mobile narrow-viewport layout
- nav/auth usability
- Draft Central anchor behavior
- draft link click-through behavior

This is an environment blocker, not a verified Task 3 rendering defect.

## Self-review

- Verified the only production code change is `src/app/page.tsx`.
- Confirmed the Supabase query, ordering, and `Draft` cast remain unchanged.
- Confirmed the inserted Draft Central section uses the exact required `id`, copy, link targets, and status rendering.
- Confirmed no changes were made to prior home components, shared nav/layout integration, global CSS, draft behavior, Supabase flow, or auth code.
- Left unrelated `next-env.d.ts` modifications untouched and unstaged.

## Concerns

- `npm run build` is currently blocked by environment/tooling issues unrelated to this page integration:
  1. sandboxed build cannot fetch Google Fonts
  2. escalated build hits a Turbopack port-binding panic
- Visual validation is blocked until the local environment provides:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
