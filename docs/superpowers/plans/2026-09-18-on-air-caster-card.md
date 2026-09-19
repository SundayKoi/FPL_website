# On Air: the casters' card, and it only prints while the stream is live

**Goal:** The league's two stream casters get a card of their own in the
pack pool. It is not a player card and it is not the Dribb: it is an **On
Air** print, and the only way to pull one is to open a pack while a Live
Drops window is open. Scarcity by attendance: the card is a reason to be in
the room while the games run. Two casters, numbered per caster per season,
capped, announced when one lands, never dusted, tradeable. It wears a
broadcast look nothing else on the board has: SMPTE colour bars, a red ON
AIR lamp, a waveform along the foot, a REC dot. Staff see and tune it on
`/admin/on-air`.

**Who the casters are:** the profiles the owner has marked **broadcaster**
on `/admin` (`profiles.is_broadcaster`, granted through
`set_profile_broadcaster`). That flag already exists and already means
"runs the stream", so the pool is every broadcaster profile that has not
been switched off. Each caster's card settings (the champion whose art the
card wears, the skin, the role word, the tagline, on/off) live in a new
table an admin edits on the page. A caster with no champion set prints the
colour-bar test pattern where the art would be: no signal. That is a
feature, not a fallback.

**Tech:** TypeScript, Next.js 16 (read `node_modules/next/dist/docs/`
before touching a page; `searchParams` are Promises), React 19, Tailwind v4
`@utility` classes in `src/app/globals.css` (class names must be literal for
Tailwind to emit them), Supabase with RLS, Vitest (`src/lib/**` and
`scripts/**` run in the node project, components and pages in jsdom), pgTAP.
Checks: `npx vitest run <path>` while working, then `npm test`,
`npx tsc --noEmit` (two pre-existing `PageProps`/`LayoutProps` errors are
known; introduce none), `npm run lint`. **Do not commit.**

**The model to copy:** the Dribb card. Read these first, in this order:
`src/lib/packs/config.ts` (DRIBB_* and `canDust`/`dustValueOf`),
`src/lib/cards/dribb.ts`, `src/lib/packs/open.ts` (the "Dribb card: five,
ever" block, the tier column mapping in the fulfil call, `announceDribbClaim`,
and the `liveSettings`/`liveNow`/`liveLabel` read the roller already does),
`supabase/migrations/20260929000001_dribb_card.sql`,
`supabase/tests/0105_dribb_card_test.sql`, `src/lib/cards/dribb.test.tsx`,
the Dribb tests in `src/lib/packs/open.test.ts`, and everywhere `dribb`
appears outside those (`grep -rn dribb src --include=*.ts --include=*.tsx`):
`PlayerCard3D.tsx`, `autoDust.ts`, `expeditions/config.ts`,
`trades/actions.ts`, `economy.ts`, `samples.ts`. The On Air card follows
the Dribb through every one of those, with the differences below.

## What differs from the Dribb

| | Dribb | On Air |
|---|---|---|
| gate | every standard pack, 1 in 10,000 | standard packs **only while a Live Drops window is open** (`liveNow` in `openPackFor`), `ON_AIR_CHANCE = 1 / 15` per pack |
| who | one made-up card | one of the casters: the one with the fewest copies minted this season, tie broken by `rand()` |
| cap | five, ever, one global counter | `ON_AIR_COPIES = 25` per caster **per season**, numbered per caster per season |
| slot | the pack's last slot | the pack's last slot, rolled AFTER the Dribb block; if the Dribb took the slot, On Air does not roll (the rarer relic wins) |
| secret? | yes — no page lists it | **no** — it is listed on `/cards/rarities`, mentioned in the go-live announcement and the shop's live notice, because the point is that people know to watch |
| art | Bard | the caster's chosen champion + skin; none set → no art, the test-pattern layer fills the photo block |
| numbers | 99 in every column | **100** in every column: Dribb is the 99, the casters are the only 100s on the board |

Everything else is the same rule: filed under its own tier (`ON_AIR_TIER =
"onair"`), never dusts (`dust_card` refuses, `canDust` false, trades
message), a relic to auto-dust and to expeditions (never boards a route that
can lose it), provenance stamps it so the stats count it apart, God packs
skip it, finishes never touch it (it replaces the slot after they roll),
announced to the channel when one lands.

## Task 1: config and the pure rules

`src/lib/packs/config.ts`, next to the Dribb constants, with the same kind
of comment (what it is, why the number, that it only rolls live):

```ts
export const ON_AIR_CHANCE = 1 / 15;   // per standard pack, ONLY inside a Live Drops window
export const ON_AIR_COPIES = 25;       // per caster, per season
export const ON_AIR_TIER = "onair";    // the inventory tier column, like "dribb"
```

`canDust` refuses `row.onAir || row.tier === ON_AIR_TIER`; `dustValueOf`
accepts an `onAir?: boolean` flag the same way it accepts `dribb`.

`src/lib/cards/onAir.ts` (pure; re-export the three constants like dribb.ts
does):

```ts
export interface OnAirCaster {
  profileId: string;          // profiles.id
  name: string;               // profiles.display_name
  champion: string | null;    // on_air_casters.champion (null = no signal)
  skin: number;               // on_air_casters.skin
  roleLabel: string;          // on_air_casters.role_label, default "Caster"
  tagline: string | null;     // on_air_casters.tagline → the card's motto
}
export interface OnAirMark { profileId: string; name: string; number: number; of: number; window: string }

export const ON_AIR_ACCENT = "#ff3b3b";
export function onAirSlug(caster: Pick<OnAirCaster, "name">): string;   // "on-air-<slugified name>", never a player's slug
export function onAirLabel(mark: Pick<OnAirMark, "number" | "of">): string; // "3 of 25"
export const ON_AIR_LOOK: OverlayPreview;         // the specimen's layers (Task 3)
export function onAirLook(mark: OnAirMark, hasArt: boolean): OverlayPreview; // + chip "ON AIR · NAME · 3 OF 25", + the no-signal layer when !hasArt
export function onAirCard(caster: OnAirCaster, number: number, season: string, window: string): PlayerCardData;
export function rollOnAir(rand: () => number): boolean;   // one rand per pack
/** The caster to print: fewest copies this season; a tie goes to rand(). Skips casters at the cap. null when none can print. */
export function pickOnAirCaster(casters: OnAirCaster[], found: Record<string, number>, rand: () => number): OnAirCaster | null;
```

`onAirCard` freezes: `slug: onAirSlug`, `name`, `tag: "ON AIR"`,
`teamName: null`, `role: caster.roleLabel`, `overall: 100`, the wrapper tier
`{ key: "challenger", label: "Challenger" }` (a placeholder exactly as the
Dribb's is; the inventory column is what prices), `archetype: "On Air"`,
`signature: caster.champion ? { champion, games: 100 } : null`,
`artSkin: caster.skin`, `motto: caster.tagline ?? "We'll be right back after
these messages."`, `serial: number`, `collectionSize: ON_AIR_COPIES`, five
sub-stats all 100 with broadcast names (`mic` "Mic", `hype` "Hype", `reads`
"Reads", `calls` "Calls", `signal` "Signal"), `highlights: [{ label: "On
the desk", value: window, detail: "Printed while the stream was live" }]`,
`badges: [{ key: "onair", label: "On Air", detail: "Only prints while a
Live Drops window is open" }]`, `standout: false`, `wins: 100, losses: 0,
winratePct: 100, level: 100, pentas: 100`, `topChampions` the champion or
`[]`, `form` all true, `season`, `live: { label: window }` (the pack's LIVE
stamp — set here because the slot is replaced after the roller stamps the
others), and `onAir: { profileId, name, number, of: ON_AIR_COPIES, window }`.

`src/lib/cards/build.ts`: add to `PlayerCardData`, beside `dribb`:
```ts
/** The On Air print — one of the casters, minted inside a Live Drops window. */
onAir?: { profileId: string; name: string; number: number; of: number; window: string } | null;
```

Tests `src/lib/cards/onAir.test.tsx` (mirror `dribb.test.tsx`): the
constants; `rollOnAir` off one rand; `onAirCard` freezes the fields above
(with and without a champion); `pickOnAirCaster` picks the fewer-minted
caster, breaks a tie with rand, skips a caster at the cap, returns null when
both are capped or the list is empty; `canDust`/`dustValueOf` refuse it;
the render tests in Task 3.

## Task 2: the database — `supabase/migrations/20261020000001_on_air_card.sql` + `supabase/tests/0124_on_air_card_test.sql`

Header comment in the style of the Dribb migration (what it is, the rules).

1. **The casters' settings.**
   ```sql
   create table if not exists public.on_air_casters (
     profile_id uuid primary key references public.profiles(id) on delete cascade,
     champion   text,
     skin       int not null default 0 check (skin between 0 and 99),
     role_label text not null default 'Caster' check (length(role_label) between 1 and 24),
     tagline    text check (tagline is null or length(tagline) <= 80),
     active     boolean not null default true,
     updated_at timestamptz not null default now()
   );
   ```
   RLS on; `select` for everyone (`using (true)`, like `profiles_public_read`);
   `insert/update/delete` for `public.is_owner() or public.is_admin()`, and
   also for the caster themself (`public.is_broadcaster() and profile_id =
   auth.uid()`). Grants to `anon, authenticated, service_role` following the
   nearest table's pattern.
2. **Numbered per caster per season, capped.** On `card_inventory`: a check
   that `not (card ? 'onAir') or ((card->'onAir'->>'number')::int between 1
   and 25)`, and a partial unique index on `(season, (card->'onAir'->>'profileId'),
   ((card->'onAir'->>'number')::int)) where card ? 'onAir'`, with a comment
   that this index IS the cap.
3. **Never dusted.** Redefine `dust_card` exactly as `20260929000001` left
   it plus one clause under the same lock: `if v_card ? 'onAir' then raise
   exception 'on air cannot be dusted'; end if;`.
4. **Never on a route that can lose it.** Redefine `launch_expedition`
   exactly as `20261015000001_expedition_mythic.sql` left it (the latest
   definer — check with `grep -l "function public.launch_expedition"
   supabase/migrations/*.sql | sort | tail -1`) plus `card ? 'onAir'` in the
   same clause that guards `dribb`, raising the same message.
5. **Provenance.** Redefine `record_card_provenance` exactly as
   `20261009000001_migration_audit_repairs.sql` left it (again, confirm the
   latest definer) plus `'onAir', new.card ? 'onAir'` in the minted print.

pgTAP `0124_on_air_card_test.sql` mirroring `0105`: a caster settings row
inserts and an anon select sees it; #1 mints and the minted print says
`onAir`; a second #1 for the same caster and season is refused (23505); the
same number for the OTHER caster in the same season is fine; #26 is refused
by the check; `dust_card` refuses it and the copy is still there; a Legend
Hunt squad carrying it is refused and a Scout lives. `plan()` count exact.

## Task 3: the look and the renderer

`src/app/globals.css`, one marked block "The On Air card" right after the
Dribb block, utilities `card-ov-onair-<layer>`; anything animated goes in
the reduced-motion list next to the Dribb classes. The conventions are the
Dribb block's: `position: absolute; inset: 0; border-radius: 12px;`,
gradients, `::before/::after` for extra shapes, `mix-blend-mode`,
`var(--ov-accent)`. It must not read as PROJECT (no scanlines, no orange
glitch), K/DA (no magenta stage light), Battlecast (no reticle), or Arcade
(no pixels).

- `card-ov-onair-bars`: SMPTE colour bars — seven vertical bars (white,
  yellow, cyan, green, magenta, red, blue) as one `linear-gradient(90deg,
  …)` with hard stops — bleeding in from the RIGHT edge of the photo block,
  masked so they fade out before the centre and stop above the archetype
  band. A thin bar row of the same colours along the very top edge. Static.
- `card-ov-onair-lamp`: the ON AIR lamp — a small rounded red box top-left
  under the tier row, deep red ground, brighter red inner glow, a soft red
  bloom around it (`box-shadow`), a slow pulse (animation; reduced-motion:
  none). The words are the chip (`card-ov-chip` prints the overlay's
  `chip`), so this layer is the lamp, not the text.
- `card-ov-onair-wave`: an audio waveform strip along the foot of the photo
  block, above the archetype band: a row of thin vertical bars of varying
  heights (a `repeating-linear-gradient` masked by a second gradient that
  varies the height, or a `::before` with a stepped gradient), in the accent
  at ~80%, a faint horizontal centre line, drifting slowly sideways
  (animation; reduced-motion: none).
- `card-ov-onair-rec`: a small "REC" corner mark top-right — a red dot that
  blinks (animation; reduced-motion: steady) with a faint dark pill behind
  it. No text in CSS: the dot is the mark.
- `card-ov-onair-nosignal`: the full test pattern for a caster with no
  champion — the seven bars at full height across the whole photo block at
  full opacity, a darker "pluge" strip along their bottom, a faint noise
  grain over it. Only present when the card has no art.

`ON_AIR_LOOK = { front: ["card-ov-onair-bars", "card-ov-onair-lamp",
"card-ov-onair-wave", "card-ov-onair-rec"], chip: "ON AIR", accent:
ON_AIR_ACCENT }`; `onAirLook(mark, hasArt)` adds `card-ov-onair-nosignal`
first (under the rest) when `!hasArt`, and sets the chip to
`ON AIR · ${NAME.toUpperCase()} · ${number} OF ${of}`.

`src/components/cards/PlayerCard3D.tsx`:
- The overlay resolution becomes `overlayProp ?? (card.dribb ?
  dribbLook(card.dribb) : card.onAir ? onAirLook(card.onAir,
  Boolean(card.artChampion ?? card.signature?.champion)) : null)`.
- A stamp in the strip after the Dribb's: `{ key: "onair", testId:
  "onair-stamp", glyph: "◉", accent: ON_AIR_ACCENT, title: "On Air — <name>,
  printed live during <window>. <number> of <of> this season.", label: "On
  Air", detail: onAirLabel(card.onAir) }`.
- The aria-label gains `, the On Air card <label>` like the Dribb's; the
  `motion` line treats `card.onAir` like `card.dribb`.

Tests (`onAir.test.tsx`, rendering through `PlayerCard3D` like
`dribb.test.tsx` does): the stamp renders with the label; the overlay
carries the four layers and the chip; a no-champion card carries the
no-signal layer and a champion card does not; every `card-ov-onair-*` class
referenced exists as an `@utility` in `globals.css` (read the file in the
test); an ordinary card renders none of it.

## Task 4: the roller — `src/lib/packs/open.ts`

Directly after the Dribb block (same style of section comment):

```ts
// ── On Air: the casters, only while the stream is live ─────────────
if (liveNow && variant !== "god" && !prints[prints.length - 1].card.dribb && rollOnAir(rand)) {
  const casters = await fetchOnAirCasters(service);            // broadcaster profiles ∩ (no row or active row)
  const found = await countOnAirThisSeason(service, season);   // { [profileId]: count }
  const caster = pickOnAirCaster(casters, found, rand);
  if (caster) prints[prints.length - 1] = { card: onAirCard(caster, (found[caster.profileId] ?? 0) + 1, season, liveLabel!), foil: false, foilType: null, signed: false, autograph: null };
}
```

`fetchOnAirCasters` and `countOnAirThisSeason` live in a new
`src/lib/cards/onAirQueries.ts` (server-only, takes the client): the first
selects `profiles` where `is_broadcaster` (id, display_name) and left-joins
`on_air_casters` in a second query (a broadcaster with no row is active
with defaults); the second is one select of `card->onAir->>profileId` for
the season where `card ? 'onAir'`, tallied in TS. The window's own
`liveLabel` is the print's `window`. The DB index is what refuses a
duplicate number or a 26th; a refused insert refunds the pack like any
other.

- Tier column mapping in the fulfil call: `print.card.onAir ? ON_AIR_TIER :`
  in the same chain as `dribb`.
- Notable-pull filter (the line that lists `print.card.dribb`): include
  `print.card.onAir`.
- `announceOnAirClaim(service, discordId, mark, league)`, called where the
  Dribb's is: title `🔴 ON AIR — ${name} is in a pack`, description `**who**
  pulled **${name} #NNN/25** during **${window}**.\nThe casters only print
  while the stream is live. It cannot be dusted.\n${left} of 25 left this
  season.` + the rarities link, colour `LIVE_RED` (the constant
  admin-actions uses; import or duplicate as the file already does for
  GOLD). No image (the render route draws players).

Tests in `open.test.ts`, mirroring the Dribb ones (swap `rollOnAir` with
`vi.hoisted`, keep the card real; extend `createShop` with `liveNow` — it
already fakes the `league_settings` read — and with the casters/counts
reads): mints into the last slot with number `found + 1`, tier `onair`,
the LIVE stamp, and announces; does NOT roll when the window is closed even
if `rollOnAir` would say yes (assert `rollOnAir` was not called); does not
roll on a God pack; when the Dribb took the slot the On Air is not rolled;
picks the caster with fewer copies; mints nothing when every caster is at
the cap; a caster with no champion prints without art (`signature` null).

## Task 5: everywhere else the Dribb is

- `src/lib/cards/autoDust.ts`: `relic` includes `card.onAir` in both places.
- `src/lib/expeditions/config.ts`: protected like the Dribb; the label
  function returns `"an On Air print"`; `shineOf` prices it as a relic (the
  same number a moment or plate gets — read what that is, do not invent one).
- `src/lib/trades/actions.ts`: `ON_AIR_UNDUSTABLE` message ("An On Air card
  is one of twenty-five a season — it can't be dusted, but you can trade
  it."), the regex for the RPC's message, and the `ON_AIR_TIER` check beside
  the Dribb's.
- `src/lib/cards/economy.ts`: count `onAir` prints apart from player cards
  exactly as `dribb` is counted (the `MintPrint`-like type gains `onAir`,
  the stats gain `onAir`). Leave `analytics/overview.ts` alone.
- `src/lib/cards/rarityGuide.ts`: an **insert** entry (the section moments
  and plates are in, not the stamps) `{ key: "onair", name: "◉ On Air",
  look: "One of the two casters, in broadcast colour bars with the ON AIR
  lamp lit. 100 in every column.", how: "Only inside a Live Drops window:
  one roll per pack at 1 in 15, and the pack's last card becomes the
  caster with the fewest prints this season.", odds: "1 in 15 packs, live
  only", value: "Never dusts. Twenty-five per caster per season." }` with
  the numbers read from the constants. `src/lib/cards/samples.ts` has a
  switch of specimens by rarity key: add `onair` returning
  `onAirCard(<a made-up caster on Bard>, 1, season, "Week 3 broadcast")`
  so `/cards/rarities` draws it. Update the rarity guide / samples tests.
- `src/lib/packs/weekNotices.ts`: the live notice's `detail` becomes
  `Foil odds boosted until … ET · every card stamped LIVE · the casters
  are in the pool`; update `weekNotices.test.ts`.
- `src/lib/packs/admin-actions.ts` `setLiveWindowAction`: the go-live
  announcement gains a line: `The casters' On Air cards are in the pool
  while it runs — 1 in 15 packs.` (number from the constant).
- `src/app/admin/page.tsx`: a card next to the Dribb's — label "On Air",
  stat "Live-only insert", description "The casters' card: prints only
  inside a Live Drops window. Who is in the pool, their art, the odds.",
  href `/admin/on-air`.

## Task 6: `/admin/on-air` — `src/app/admin/on-air/page.tsx` + `src/components/admin/OnAirCasterForm.tsx`

Staff-gated like `/admin/dribb` (`fetchStaffTier`, admin or owner, else
`redirect("/admin")`). Server page, cookie-bound client.

- **Header**: "On Air", what it is in two sentences, and the gold "what
  mints" line: only inside a Live Drops window, `ON_AIR_CHANCE` per pack,
  `ON_AIR_COPIES` per caster per season, never dusts, announced when it
  lands. Link to `/admin` and to the schedule page's Live Drops switch.
- **The pool**: every broadcaster profile (`profiles` where
  `is_broadcaster`, id + display_name; owners grant that on `/admin` — say
  so, with a note that a broadcaster with no row is in the pool with
  defaults). One row per caster: the preview card exactly as it would mint
  next (`onAirCard(caster, found + 1, season, "Preview")`, interactive,
  through `PlayerCard3D`), the count minted this season
  (`countOnAirThisSeason`), and the form. Empty state when nobody is a
  broadcaster.
- **`OnAirCasterForm`** (client): champion (a text input with a `<datalist>`
  of `CHAMPIONS.map(c => c.name)` from `src/lib/match-draft/champions.ts`;
  blank = no signal), skin number (0–99), role word (default "Caster";
  suggest "Play-by-play" and "Colour" in the placeholder), tagline (≤ 80),
  "In the pool" checkbox. Saves with the browser Supabase client's `upsert`
  on `on_air_casters` (RLS is the gate — the `AdminSeasonSettings` pattern),
  then `router.refresh()`. Errors verbatim. `save` disabled while busy.
- **The look**: the specimen (a made-up caster on Bard) with art and
  without (no signal), captioned, so the look can be judged even before a
  caster has set anything.
- Season: `league_settings.current_season` (the premier season; the pool is
  league-wide but copies are numbered per season, and the roller uses the
  pack's season).

Tests: `page.test.tsx` beside it (mock `PlayerCard3D`, the Supabase server
client and `fetchStaffTier` the way `src/app/admin/sendoff/page.test.tsx`
does): redirects a non-staff visitor; renders one row per broadcaster with
the count and the form; renders the two specimens; the empty state.
`OnAirCasterForm.test.tsx`: submits an upsert with the typed values and
refreshes; blank champion saves `null`; shows the error.

## Task 7: docs

`docs/backend.md`: a paragraph **"On Air."** right after the Dribb
paragraph, in the same register: what it is, the gate (live only, 1 in 15,
last slot after the Dribb), the pool (broadcaster profiles, the settings
table, no-signal art), the cap and index, the never-dusts/relic rules, that
it is NOT a secret (rarities page, notices, announcements), the admin page,
the migration and pgTAP numbers.

## See it

Reuse the screenshot harness from the Send-off work. Write a temporary
`src/lib/cards/zz_onair_harness.test.tsx` (never committed, never edited
into the real tests) that renders, through the real `PlayerCard3D`, a row
`<section data-row="onair">` with: a caster on Bard #1/25, a caster with no
champion (no signal) #12/25, and a caster on a skin (say Ahri skin 7)
#25/25; and a row `<section data-row="reference">` with an ordinary season
card and the Dribb specimen for scale; writing the HTML to
`process.env.HARNESS_OUT`. Then:

```
S=/tmp/claude-0/-home-user-FPL-website/c8504eab-4faa-5e0f-bde4-ae130c1ae6a3/scratchpad
HARNESS_OUT=$S/harness.html npx vitest run src/lib/cards/zz_onair_harness.test.tsx --reporter=dot
node $S/shot.mjs      # recompiles globals.css, paints, writes $S/look-onair.png and $S/look-reference.png
```

Read `$S/look-onair.png`. Iterate on the CSS until: the bars are
unmistakably colour bars and do not cover the name, role or rating; the
lamp reads as a lit lamp; the waveform sits clear of the archetype band;
the no-signal card is plainly a test pattern; nothing overlaps the serial
or the stat block. Delete the harness file when done.
