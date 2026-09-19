# On Air: a real skin picker on the casters' desk

**Goal:** The Skin field on `/admin/on-air` is a bare number, and it has to
be Riot's own skin num for the champion, which is sparse (Ahri: 0–8, 14, 17,
27, …). A wrong number saves fine and silently prints the base art, which
reads as "the skin picker doesn't work". Replace it with a picker that lists
the champion's skins BY NAME, shows the art of the one chosen, and refuses a
number that is not in the list. Keep the number input only as the fallback
for when the catalog cannot be read.

**Tech and checks:** as the previous On Air plans
(`docs/superpowers/plans/2026-09-18-on-air-caster-card.md`,
`2026-09-19-on-air-slate.md`). Read first: `src/components/admin/OnAirCasterForm.tsx`
and its test, `src/components/cards/SkinPicker.tsx` (the card page's picker:
how it loads a catalog with a request counter, `uniqueSkins`, the skin list
with the `<img>` thumbnails and their splash fallback on error, and whatever
lint directive it uses for `<img>`), `src/lib/packs/skins.ts`
(`fetchChampionSkinCatalog`, `ChampionSkin`, `ChampionSkinCatalog`),
`src/lib/match-draft/champions.ts` (`championByName`, `CHAMPIONS`,
`championCenteredUrl`, `championSplashUrl`), `src/lib/packs/admin-actions.ts`
(the `"use server"` + `requireAdmin` pattern), `src/app/admin/on-air/page.tsx`
and its test, and the applied migration `supabase/migrations/20261020000001_on_air_card.sql`
(read only; never edit it). `npx vitest run <path>` while working, then
`npm test`, `npx tsc --noEmit` (two known `PageProps`/`LayoutProps` errors;
introduce none), `npm run lint`. **Do not commit.**

## Task 1: a staff-scoped catalog action — `src/lib/cards/onAir-actions.ts`

`"use server"`. The card page's `/api/cards/artwork/catalog` route is
scoped to a player's own card (`can_edit_card_art`, played champions), so
the desk cannot use it. One action:

```ts
export async function fetchOnAirSkinCatalogAction(champion: string): Promise<
  | { ok: true; champion: string; available: boolean; skins: ChampionSkin[] }
  | { ok: false; error: string }
>;
```

Gate: `fetchStaffTier` with the cookie-bound server client, admin or owner,
else `{ ok: false, error: "Admins only." }` (the `requireAdmin` shape in
`admin-actions.ts`). Resolve the name with `championByName`; unknown →
`{ ok: false, error: "Unknown champion." }`. Otherwise
`fetchChampionSkinCatalog(champion.name)` and return its `champion`,
`available` and `skins` (base first, already sorted by num). Test beside it
(mock the Supabase server client, `fetchStaffTier` and `fetchChampionSkinCatalog`):
refuses a non-staff caller, refuses an unknown champion, returns the catalog
under the canonical champion name.

## Task 2: the picker — `src/components/admin/OnAirCasterForm.tsx`

Keep the champion text input with its `<datalist>`, the role word, the
tagline, the pool checkbox, the upsert, the `Saved` state and the error
line. Change the skin.

- **Loading.** A `catalogs` map in state keyed by canonical champion name,
  a request counter ref (SkinPicker's pattern) so a slow reply for a
  champion typed earlier never overwrites a later one, `loadingCatalog`.
  On mount, if `champion` resolves via `championByName`, load its catalog.
  On every champion change, if the new value resolves, load (reuse the map
  when already loaded); if it does not resolve, or is blank, no request.
  The champion input's `onBlur` also triggers a load, so a name typed in
  full without picking from the datalist still resolves. Resetting the
  skin: when the champion changes to a different champion, skin becomes 0;
  when it changes to the same canonical champion (case/spacing), keep it.
- **The select.** When a catalog for the current champion is loaded and
  `available`, the Skin field is a `<select id="{field}-skin">` (label
  "Skin", same label the test finds today) whose options are the catalog's
  skins in num order, each reading `{name}` (num 0 reads "Original") with
  `value={num}`. While loading: the select is rendered disabled with a
  single "Loading skins…" option. If the current saved skin is not in the
  catalog (a stale number), keep it as an extra option labelled
  `Skin {num} (not in Riot's list)` so nothing is silently changed, and
  show the not-in-list error only on save.
- **The fallback.** When there is no champion, the champion is unknown, or
  the catalog came back `available: false` or the action errored: the
  number input exactly as today (`type="number"`, min 0, max 200), plus a
  one-line hint under it: "Riot's skin number; the list could not be
  loaded" (or "Set a champion to pick a skin by name" when blank). The
  error from the action, if any, in the form's error line.
- **The thumbnail.** Beside the select, when a champion resolves: one
  `<img>` ~96px wide, 4:3, rounded, of the chosen skin —
  `championCenteredUrl(champion, skin)`, falling back to
  `championSplashUrl` on error exactly the way SkinPicker does (same lint
  directive if it uses one), `alt=""`. `data-testid="{field}-skin-art"`.
- **Save.** `skin` is the select's value (or the number input's in
  fallback). Before the upsert, if a catalog is loaded and available and
  the number is not in it, refuse with "That skin is not one of
  {champion}'s." and do not call the upsert. Clamp the number to 0–200
  (not 99).

Tests (`OnAirCasterForm.test.tsx`, mock `@/lib/cards/onAir-actions` with
`vi.hoisted` like the Supabase client): with a catalog of `[{0,"Original"},
{7,"Foxfire Ahri"}]` the Skin field is a select listing both names;
choosing "Foxfire Ahri" and saving upserts `skin: 7`; the thumbnail's `src`
changes with the choice; a champion the action calls unknown, or a catalog
with `available: false`, shows the number input and saves the typed
number; a saved skin not in the catalog is kept as an extra option and
refused on save with the message and no upsert; changing the champion
resets the skin to 0 and loads the new catalog; the existing tests still
pass (adapt the "7" typed into the Skin field to selecting it).

## Task 3: lift the cap — `supabase/migrations/20261021000001_on_air_skin_range.sql` + `supabase/tests/0125_on_air_skin_range_test.sql`

The applied migration created `on_air_casters.skin` with an inline
`check (skin between 0 and 99)`. Riot's nums run past that for champions
with many skins and chromas, and `save_card_art_preference` (20261018)
already accepts up to 200. Forward migration, header comment saying why:

```sql
alter table public.on_air_casters drop constraint if exists on_air_casters_skin_check;
alter table public.on_air_casters
  add constraint on_air_casters_skin_check check (skin between 0 and 200);
```

pgTAP `0125`: `plan(2)`: a row with skin 150 inserts; skin 201 raises
23514. Fixtures as `0124` does them (a profile, a settings row).

## Task 4: copy and docs

- `src/app/admin/on-air/page.tsx`: the pool intro's sentence about saving
  gains "pick the skin by name; the art of the one chosen shows beside it".
- `docs/backend.md`, the On Air paragraph: one sentence — the desk's skin
  picker reads the champion's catalog through a staff-gated action
  (`fetchOnAirSkinCatalogAction`) and refuses a num outside it; the cap is
  200 (`20261021000001`).
