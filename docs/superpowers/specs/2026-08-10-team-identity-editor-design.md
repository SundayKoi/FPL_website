# Team Identity Editor and Roster Card Cleanup

**Date:** 2026-08-10  
**Scope:** Update the public `/teams` section so team cards no longer show point totals or remaining budgets, and give authenticated admins an inline editor for team abbreviation, name, captain, and picture.

## Goals

- Remove both point-total displays from team roster cards: the header value and the remaining-budget footer.
- Show an admin-only `Edit teams` control directly on `/teams` when a persisted featured draft is selected.
- Let admins edit each selected draft team’s abbreviation, name, captain, and picture without leaving `/teams`.
- Store uploaded pictures in a public Supabase Storage bucket and use a text monogram when a team has no picture.
- Preserve the existing roster-swap editor, draft selector, public preview state, auction behavior, and draft permissions.

## Non-goals

- Placeholder preview teams remain read-only.
- This does not add player creation, player deletion, player role editing, or roster-swap changes.
- This does not introduce a separate admin route or a modal workflow.
- This does not change team budgets or any budget/point calculations; it only removes their display from the teams cards.

## User experience

The selected-draft `/teams` page keeps its existing header and featured-draft selector. When the viewer is an admin, an `Edit teams` button appears alongside the existing admin controls. Clicking it replaces the admin roster-swap content with an inline grid of team identity forms. A `Done editing teams` control returns to the normal admin roster view.

Each team identity form contains:

1. An abbreviation text input, normalized to uppercase and limited to 1–5 characters.
2. A required team-name text input.
3. A captain select populated from the existing `profiles` rows, with an explicit `— none —` option.
4. An image file input accepting image files up to 2 MiB.
5. A preview of the current or newly selected picture, with the team abbreviation/monogram as the fallback.
6. A `Save team` button and a `Remove picture` action when a picture exists.

Saving is per team. The button is disabled while the upload/update is running, and the form reports a readable success or error message without losing the other teams’ unsaved values. On success, the client refreshes the server-rendered page so public cards and captain labels use the persisted values.

Normal team cards show the uploaded picture when available, otherwise the stored abbreviation, otherwise the existing derived monogram as a defensive fallback. They continue to show the captain label and five roster rows, but do not show any point total or remaining-budget text.

If no persisted draft is featured, the page continues to show the 12-team preview data. The preview does not show `Edit teams` and cannot be written to.

## Data model and storage

Add a migration that extends `public.teams` with:

```sql
abbreviation text not null default 'TEAM'
image_url text
```

The migration backfills `abbreviation` for existing teams from the first letters of their names, uppercases the result, truncates it to five characters, and uses `TEAM` if a name produces no letters. Add a check constraint requiring `trim(abbreviation)` to contain 1–5 characters. Existing public-read and admin-write policies remain the authorization boundary for team updates; the UI only sends the four supported identity fields.

The existing admin team-creation path and demo/E2E seed inputs will provide a derived abbreviation when creating a team; the database default remains as a compatibility guard for any other existing insert path.

Create or ensure a public Supabase Storage bucket named `team-images`. Storage policies must allow public reads and restrict insert, update, and delete operations in that bucket to `public.is_admin()`. Store each image at a deterministic path based on the draft and team, such as `{draftId}/{teamId}`, using the uploaded file’s content type. Deterministic paths allow replacement without accumulating one object per save. The saved public URL is written to `teams.image_url`.

The browser validates image type and the 2 MiB limit before upload. If the database update fails after an upload, the client makes a best-effort removal of the newly uploaded object and retains the existing database value. Removing a picture deletes the deterministic object when possible and sets `image_url` to `null`.

## Component and data flow

`src/app/teams/page.tsx` remains a Next.js App Router Server Component. It continues to load the featured draft, teams, players, and admin status. For the selected draft it also loads the profiles needed to label the selected `captain_profile_id`; this uses the existing public profile-read policy. It passes serializable team, player, profile, and draft data into the client editor.

`src/lib/draft/types.ts` expands `Team` with `abbreviation` and `image_url`. `RosterTeamView` gains the team abbreviation and image URL needed by the card. `src/lib/teams/roster.ts` uses the stored abbreviation and image URL and resolves the captain display name from `captain_profile_id`, falling back to the captain roster player and then `Unassigned` when no profile is selected.

`src/components/teams/TeamRosterCard.tsx` remains the shared presentation for public and swap-editor cards. Its branded header uses the picture or abbreviation fallback. The point value in the team header and the remaining-budget footer are removed entirely. Existing role rows, captain lock treatment, drag/drop behavior, and keyboard swap controls remain intact.

Add `src/components/teams/AdminTeamEditor.tsx` as a focused client component. It owns only edit-mode state, per-team draft form state, file selection, upload/update status, and calls to Supabase Storage and the `teams` table. It renders the admin toggle plus the inline identity forms and accepts the existing roster editor as its normal-mode content, so roster swaps remain available without duplicating the public grid.

`src/components/teams/TeamsDirectory.tsx` keeps the public page shell and placeholder/selected-draft states. When the page has a selected draft and the viewer is an admin, it composes `AdminTeamEditor` around `AdminRosterEditor`; otherwise it renders the existing read-only card grid.

## Validation and error handling

- The UI trims the team name and rejects an empty value.
- The UI trims and uppercases the abbreviation and rejects values longer than five characters.
- Only image MIME types are accepted, and files over 2 MiB are rejected before upload.
- A missing captain is valid and is represented by `null`.
- Database errors are shown in the existing admin error style and do not trigger a success refresh.
- Storage errors are shown as upload errors and do not overwrite the existing `image_url`.
- Admin authorization is enforced by the existing `teams_admin_write` policy and Storage policies, not only by the hidden button.
- Non-admin users never receive the editor controls, and direct unauthorized writes remain rejected by RLS.

## Testing

Frontend tests cover:

- Team cards render abbreviation/image fallback and no longer render point totals or remaining-budget text.
- The selected draft page passes team identity data and profiles into the admin editor, while preview mode remains non-editable.
- The admin editor is hidden for non-admins, toggles inline for admins, validates empty names/long abbreviations/oversized non-images, uploads a valid file to the deterministic path, updates the team row with the public URL, and handles update/upload errors without losing form state.
- Captain labels use the selected profile name when `captain_profile_id` changes.

Database tests cover:

- The new `teams` columns and abbreviation constraint exist.
- Existing team rows receive non-empty backfilled abbreviations.
- Admin team updates can persist abbreviation, name, captain, and `image_url`.
- Non-admin team updates are rejected.
- Storage object reads are public while storage writes are admin-only.

Verification will run the focused Vitest files first, followed by the full Vitest suite, ESLint, the Next.js production build, and the local Supabase database test suite when the local Supabase environment is available.

## Decisions and rationale

An inline editor is preferred over a separate admin route because admins can see the selected draft and roster context while editing. Per-team saves keep failures isolated and match the existing admin setup editor’s direct-write behavior. Supabase Storage is preferred over external URLs because it uses the application’s existing authentication and database policies and gives public team cards a stable, controlled asset source.
