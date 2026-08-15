# Draft Countdowns and Spectator Preview Design

**Date:** 2026-08-15

## Goal

Improve Draft Central with upcoming Season 5 and Academy draft countdowns, allow admins to schedule each draft independently, and turn the existing setup board into a read-only spectator preview before the draft goes live.

## Decisions

- Scheduling is stored per draft, not in global league settings.
- Admins enter the schedule in Eastern Time; the application stores the resulting absolute timestamp.
- The normal `/draft/:id` route is used for both the pre-live preview and the live draft board.
- The Season 5 draft and Academy draft are ordinary draft records with independent schedules.
- The existing auction bid countdown (`countdown_seconds`) remains a separate setting from the scheduled start time.

## User experience

### Draft Central

`/draft` will lead with an upcoming-events area. Each scheduled setup draft is represented by a countdown card showing its name, scheduled Eastern Time, status, and a live days/hours/minutes/seconds countdown. The Season 5 and Academy drafts are therefore presented consistently without hard-coded event logic. When a countdown reaches zero, the card changes to a live-now state; completed drafts continue to appear in the existing draft list. Drafts without a schedule show a clear unscheduled state rather than a broken timer.

The rest of the page will be visually strengthened with a clearer page header, higher-contrast status treatments, and more informative draft cards while preserving the existing links and navigation.

### Admin scheduling

The per-draft admin page will include a schedule field labeled `Draft start (Eastern Time)` and a save action. The form will accept a local date/time value, validate it before writing, and display success or error feedback. It will be available while a draft is in setup; already-live or completed drafts will retain their stored schedule but will not expose a misleading setup editor. Creating a draft will leave the schedule unset until an admin configures it.

### Setup spectator preview

When a draft is in `setup`, `/draft/:id` will render a read-only preview rather than only the current empty-state message. It will include:

- The draft title, `Preview` status, scheduled start time, and countdown when configured.
- Team cards with team identity, nomination order, captain, budget, and empty roster slots.
- The configured player pool with roles and ranks.
- A central placeholder explaining that nominations and bidding appear after launch.
- Clear admin and spectator navigation affordances without exposing captain bidding, nominations, or mutating controls.

The preview will use the same draft, team, and player records as the live board. Once the admin starts the draft, the existing live board is rendered at the same URL. Paused and complete drafts retain their current behavior.

## Data model and flow

Add a nullable `starts_at timestamptz` column to `public.drafts`. Public draft reads already allow spectators to see draft rows, so no new public read policy is needed. Admin writes will be protected by the existing admin policy; the client will update only the current draft row after validating the input. The TypeScript `Draft` interface will include `starts_at: string | null`.

Server components will continue fetching draft data through Supabase. Draft Central will pass scheduled drafts to a reusable countdown card. The draft board will use the existing `useSyncExternalStore`-based home countdown pattern (or a focused shared equivalent) so server rendering remains hydration-safe and the visible timer updates once per second.

Eastern Time input will be converted to an absolute timestamp at the form boundary using the project’s supported date/time handling. Display formatting will consistently use `America/New_York`, including the correct daylight-saving offset, rather than appending a static EST label.

## Validation and failure behavior

- Empty schedule is valid and means “Not scheduled.”
- Invalid or unparsable date/time input is rejected with an inline admin error and does not update the row.
- A past scheduled time is accepted so admins can configure or repair records; the public UI displays `Live now` or the draft’s actual status rather than a negative timer.
- A failed Supabase update leaves the current saved value visible and reports the returned error.
- If a scheduled draft cannot be loaded, Draft Central falls back to its existing empty/list behavior without crashing.
- The preview never enables mutations merely because a draft has a schedule; draft status and existing authorization continue to govern controls.

## Testing

- Add unit coverage for countdown-card states: future, zero/past, and unscheduled.
- Add component coverage for Draft Central’s upcoming cards and the setup preview.
- Add admin editor coverage for loading, saving, clearing, and rejecting invalid schedule values.
- Extend draft type fixtures with `starts_at` so existing tests model the schema accurately.
- Add an end-to-end setup assertion when the local seeded draft remains suitable: the setup URL shows preview copy and no bid controls before launch.
- Run the full Vitest suite, lint, and the relevant Playwright test after implementation.

## Scope boundaries

This feature does not automatically start drafts at the scheduled time, add a new spectator identity system, change auction timing, redesign the live auction interactions, or introduce a separate events table. Admins still explicitly start the draft; the schedule is informational and presentation-focused until that action occurs.
