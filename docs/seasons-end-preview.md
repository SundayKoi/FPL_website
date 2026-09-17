# Season’s End preview

`/admin/seasons-end` is linked from Admin for staff and can also be opened by
active patrons who receive the URL. Staff are checked through the authenticated
profile; broadcaster alone does not grant access. Patron access uses the
read-only patron window and shows only the card collection — no staff controls,
selection diagnostics, or developer crop audit. It uses the cookie-bound
Supabase client and existing read policies, with no new database objects,
writes, pack entries, or minted cards.

The league dropdown switches between the fixed Premier S5 and Academy A1
snapshots. Each raw query is restricted to that league's season and `Regular`.
Queries are paginated and ordered, and failures render an error rather than a
partial collection. A supplied `season` query parameter is ignored.

All player awards use the normal `PlayerCard3D` renderer and `buildSeasonCards`
engine. Complete regular-season rows are aggregated through the existing raw-row
aggregation function, with the entire league as the rating cohort. Player cards
retain their season OVR, stat bars, record, champion history, and interactive back.
Award titles decorate the archetype label; award metrics are printed above the
card. They are not substituted for an OVR. Weekly standout badges are disabled.

- **Best of [champion]:** a qualifying player/champion record needs at least
  five complete regular-season games overall and at least three games on that
  champion. Records rank by champion wins, then unrounded win rate, then
  unrounded mean role-relative performance; integer cross-products compare win
  rates. The strongest-result-first allocation awards at most one card per
  player and per champion across Solari and Lunari together. It skips later
  candidates for an awarded player or champion, so qualifying players and
  champions can remain unawarded. There is no minimum win rate, win total, or
  performance floor. See the [Best of results-ranking decision](plans/2026-09-16-best-of-results-ranking.md)
  for the selection diagnostics and tie rules.
- **Dynamic Duo:** the bot/support pairing with the highest cumulative combined
  fantasy-stat points in games played together. The win tariff is zero. At least
  four shared games are required; score ties share the award. The two normal
  player cards sit together under their shared total and cumulative K/D/A.
- **Season Cards:** replaces Ironman. Every player with strictly more than five
  complete regular-season games receives their normal cumulative season card.
  Players below that cutoff remain in the rating cohort.
- **Undefeated:** replaces Regular-Season Royalty. Teams need positive wins and
  zero game losses across regular-season fixtures, including forfeits. An observed
  loss in stats also disqualifies them. Withheld until all regular fixtures are
  complete. The normal roster-card renderer displays the team; the contributor
  list includes everyone observed on that team during the regular season.

Other award eligibility is printed on the page. Only complete ten-player matches
with distinct player identities and consistent five-player teams/results count.
Missing required numeric fields withhold the corresponding award. All awards are
provisional until the ingest and fixtures have been reviewed.

The older `src/lib/cards/seasonsEnd/awards.ts` adapter remains a separate legacy
engine with its own assignment contract and tests. This results-based selector
applies to the active `/admin/seasons-end` preview only.

Verification: `src/lib/season-end/best-of.test.ts` and
`src/lib/season-end/derive.test.ts` cover thresholds, ranking, caps, ties,
aliases, pagination and isolation; `src/lib/cards/seasonsEnd/*.test.ts` keeps
the legacy assignment engine covered; `src/app/admin/seasons-end/page.test.tsx`
covers the staff/patron server gate, the patron-safe card view, and read-error/
empty states. No migration is required.
