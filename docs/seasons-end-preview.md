# Season's End admin preview

`/admin/seasons-end` combines the awards preview and staff release controls.
The detailed award and rendering contract lives in
[Season's End cards](season-end-cards.md); the frozen release, purchase,
commerce, and auto-dust contract lives in
[the backend reference](backend.md#seasons-end-release-and-commerce).

## Access and data

Admins and owners can inspect awards, diagnostics, crop tools, and the release
panel. Active patrons who receive the URL can view the card collection without
those staff controls; broadcaster status alone does not grant access. The page
checks staff through the authenticated profile and patron status through the
trusted patron reader. The parent admin layout supplies navigation, not the
page's authorization.

The league selector is pinned to Premier S5 and Academy A1. The awards loader
uses the cookie-bound client, scopes raw rows to the selected league's season
and regular competition, and paginates its reads. A supplied `season` query
parameter does not change those fixed snapshots. Failed award reads display an
error rather than partial winners. Cumulative card rendering and release
metadata can fail independently without hiding otherwise valid awards.

Page reads do not mint cards, but this is no longer a preview-only feature with
no database dependencies. The staff-only `SeasonEndReleasePanel` invokes
trusted release actions. Patron and release metadata reads use the service
client; each mutation must retain its own authorization. Verify the release
migrations before deploying dependent code as described in
[release contracts](releases.md).

## Award rendering

Ordinary accolades use `SeasonEndAwardCard`; Best of Champion uses its full-art
face. Cumulative Season Cards use `PlayerCard3D` and retain their normal OVR and
stats. The admin desk disables Best of variant controls; do not assume every
capability of the shared renderer is exposed on this route.

Best of Champion uses three ordered allocation passes: records with at least
three champion games; unclaimed pairs with at least two champion games and one
win; then remaining players' available champions from any appearance. Players
need five regular-season games overall. Each pass ranks wins, win rate, and
mean role-relative performance, keeping earlier selections fixed and at most
one award per player and champion. See `src/lib/season-end/best-of.ts` and
[the full card reference](season-end-cards.md) for the current rules rather than
the old single-pass design.

## Verification sources

`src/lib/season-end/best-of.test.ts` and `src/lib/season-end/derive.test.ts`
cover award behavior. `src/app/admin/seasons-end/page.test.tsx` covers the
staff/patron gate and page states. Release actions, opening recovery, and
commerce additionally require their application and pgTAP coverage; a passing
preview test does not verify those database transitions. Choose checks using
[testing](testing.md).
