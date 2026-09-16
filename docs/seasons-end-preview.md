# Season’s End admin preview

`/admin/seasons-end` is linked from Admin and checks the authenticated profile
for admin or owner before querying data. Broadcaster alone does not grant access.
It uses the cookie-bound Supabase client and existing read policies, with no
new database objects, writes, pack entries, or minted cards.

Select Premier or Academy and a historical season. Seasons are discovered from
`stats_player_agg`; each raw query is restricted to one season and `Regular`.
Queries are paginated and ordered, and failures render an error rather than a
partial collection. Invalid or cross-league season parameters fall back to the
latest available season in the selected league.

All player awards use the normal `PlayerCard3D` renderer and `buildSeasonCards`
engine. Complete regular-season rows are aggregated through the existing raw-row
aggregation function, with the entire league as the rating cohort. Player cards
retain their season OVR, stat bars, record, champion history, and interactive back.
Award titles decorate the archetype label; award metrics are printed above the
card. They are not substituted for an OVR. Weekly standout badges are disabled.

- **Best of [champion]:** one played champion per player and one player per
  champion. The Hungarian assignment maximizes player coverage first, then total
  score (60% win rate + 40% mean role percentile of fantasy game score).
  Players need at least five complete regular-season games; there is no score
  floor, and a champion can be selected even when its score is below 70. This
  constrained assignment is not an independent leaderboard per champion. If
  coverage is impossible, only real assignments render and unmatched players
  are named in a warning. A contested champion favors the higher
  champion-specific score, with deterministic tie resolution.
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

Verification: `src/lib/cards/seasonsEnd/*.test.ts` covers assignment, ranking,
coverage, pagination and isolation; `src/app/admin/seasons-end/page.test.tsx`
covers the server gate and read-error/empty states. No migration is required.
