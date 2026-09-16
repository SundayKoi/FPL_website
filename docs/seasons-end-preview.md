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

The page contains twelve award families. Each prints its eligibility/ranking
rule, winner, champion art, and supporting statistics. Ties share honors.
Champion Sovereigns and Pocket Pick use 60% win rate plus 40% average role
percentile of the existing fantasy game score. Ascension compares those role
percentiles across the chronological halves of the league season. This score
does not modify existing card ratings or fantasy scoring.

Only complete ten-player matches with distinct player identities and consistent
five-player teams/results count. Missing required numeric fields withhold the
associated award. Ironman explicitly measures coverage of ingested team games;
it cannot prove an unreported game does not exist. The roster award uses fixture
series wins per division, includes forfeits, preserves tied leaders, and is
withheld until all regular fixtures have decisive scores. Rosters list all
observed season contributors rather than assuming the current roster played
the entire season. All awards remain labeled provisional until reviewed.

Verification: `src/lib/cards/seasonsEnd/*.test.ts` covers ranking, coverage,
pagination and isolation; `src/app/admin/seasons-end/page.test.tsx` covers the
server gate and read-error/empty states. No migration is required.
