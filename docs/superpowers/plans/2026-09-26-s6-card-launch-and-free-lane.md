# S6 card launch, free lane, and finding out why players drift

Status: plan, not yet built. Discussed in chat 2026-09-26. Everything here
applies to **Premier S6+ and Academy A2+** only; S5 and A1 finish exactly as
they are.

## The problem

Pack openers, packs opened, expeditions and daily games all fall steadily
from about week 4 of a season. About 75% of league members buy premium ($10
at signup, for the whole ~2.5-month season). Without it a member can browse
cards but cannot open packs, run expeditions or play the daily games.

That points at two separate problems:

1. **Paying players drift after week 4.** They already have everything, so
   this is engagement, not price. The early weeks run on novelty and luck,
   which fade — the research summary is at the end.
2. **The other 25% never get hooked.** They decide once, at signup, before
   touching a card, and are then locked out all season. Premium can already
   be bought mid-season, but nothing gives a non-member a reason to.

The plan addresses (2) directly, gives (1) a better launch, and **measures
before building anything to fix (1)**: we do not yet know what would.

## 0. Season gate

One helper decides whether a season gets the new behaviour, alongside the
rating gate: seasons outside S1–S5 and A1. `LEGACY_RATING_SEASONS` in
`src/lib/cards/styleYardsticks.ts` already encodes exactly that list; lift
it into a shared `isLaunchEraSeason(season)` (or rename it) so the rating,
the free lane and the launch package can never disagree about which
seasons are "new".

## 1. Measure retention (build first — it is small)

The staff dashboard (`analytics_overview`, migration 20261005000001) counts
weekly active players per mode. It cannot answer the question that matters:
*of the people active in a season's first week, how many are still active
in week 4, 6, 8?*

- Add a **cohort table** to the analytics read: for each season week, how
  many of week 1's active players were active that week, per mode.
- **Split premium vs free.** Premium is a Discord role and is not stored,
  so record it: stamp `premium` (and when it was last seen) on the wallet
  row whenever `getBettingUser` checks access. Without that stamp the split
  cannot be computed after the fact.
- Forward migration + pgTAP, service-role only like the existing read.

This is what tells us, at week 5 of S6, whether anything we shipped held
people or merely re-spiked them.

## 2. Free lane for non-premium league members

**Who.** Signed in with Discord, with a claimed card identity (the existing
card-claim flow), so the lane is for league players and cannot be farmed
with alt accounts. No premium role.

**What they get:**

- **Their own card**, live, moving week to week — the strongest personal
  hook there is.
- **One free pack a week** (premium keeps the Daily Rip every day). Pulls
  land in a real collection that carries over if they upgrade.
- **The daily games, without the betting-dollar reward.**

**What stays premium:** paid packs, the Daily Rip, expeditions, the market,
trades, Showdown, the Gauntlet, sets payouts, finishes and slabs — nearly
everything that exists today.

**Upgrade.** Every free-lane surface shows the mid-season upgrade that
already exists; buying it unlocks everything and keeps the collection.

**How it is enforced.** Today every card action calls `getBettingUser()`,
which requires the premium role. Give it (or a sibling) an access *tier*
— `premium` | `free` | none — and let each action decide what a tier may
do. The limits live in the RPCs, not the UI: a weekly free pack is its own
server-side limit next to `open_daily_pack`'s daily one. The free lane must
not mint betting dollars; check its interaction with the wallet signup
bonus.

## 3. S6 launch package

Timed for the first two weeks, when a new season brings people back
anyway. The research says a player's first week decides whether they stay,
and that it should get them *connected*, not just rewarded.

- **Rookie cards.** A player's first card in their first league season
  carries a one-time rookie stamp, frozen on pulled copies like every other
  stamp.
- **Style sets.** Collect one card each of Assassin, Tank, Enchanter,
  Marksman and Bruiser with a style bar of 85+, in one season. Built on the
  new style rating, and gives collecting a goal beyond "high OVR". Uses the
  roster-set claim machinery (`sets.ts`, `setClaim.ts`).
- **Starter path.** A short first-visit checklist: claim your card, open
  your welcome pack, try a daily game, look at your card after your first
  game. Free-lane players get the same path, ending at the upgrade.
- **Welcome pack.** One free pack for every account's first visit in the
  season.
- **S5 as throwbacks.** S5 is the last season on the old rating; label its
  cards as the closed set they now are.

## 4. Survey (run before S6, in Discord)

Short — five questions, one screen:

1. How often did you use the cards this season? *(Every day / A few times a
   week / Early on, then stopped / Never)*
2. If you stopped or slowed down, when? *(Week 1–2 / Week 3–4 / Week 5+ /
   Didn't slow down)*
3. What best describes why? *(Got repetitive / Nothing to do with friends /
   Didn't feel tied to our games / Too many systems to keep up with /
   Rewards didn't feel worth it / Just not into cards / Other)*
4. Which would most make you come back? *(Card duels against friends,
   scored by real games / Something live on match night / Faster or bigger
   rewards / Simpler — fewer things to track / Nothing, cards aren't for
   me)*
5. Anything else? *(free text)*

Tally by premium vs free. A large "just not into cards" is a real answer:
it means make the launch great rather than chase a mid-season fix.

## 5. Deferred until the survey is in

- **Card duels** — "my five vs your five, scored by next week's games".
  Pilot a minimal version only if the survey points at friends or at being
  tied to real games.
- Anything aimed at mid-season drift.

## Order

1. Retention cohort + premium stamp (so S6 is measured from day one).
2. Free lane.
3. Launch package.
4. Survey — independent; can go out now.

## Open questions

- Is the free lane Premier and Academy both? (Assumed yes.)
- Free pack weekly, or a few spread across the season?
- Does anything free-lane players do earn betting dollars? (Assumed no.)

## Research behind this

- Unpredictable rewards (packs) hook quickly and fade as people adapt —
  consistent with the week-4 drop across every mode.
- Self-Determination Theory: competence, autonomy and relatedness predict
  enjoyment and continued play ([Ryan, Rigby & Przybylski](https://www.researchgate.net/publication/225998888_The_Motivational_Pull_of_Video_Games_A_Self-Determination_Theory_Approach)).
- Social ties are the strongest predictor of long-term retention, and
  first-week social engagement predicts day-30 retention
  ([Achievement and Friends](https://arxiv.org/abs/1702.08005);
  [JYX](https://jyx.jyu.fi/jyx/Record/jyx_123456789_66822)).
- Owning players deepens fandom and viewing
  ([Fantasy sport participation](https://www.sciencedirect.com/science/article/abs/pii/S1441352310000756)).
- People value what they already own (endowment effect) — the case for a
  free taste before asking for an upgrade.
- Rewarding what people already enjoy can undermine it
  ([Deci, Koestner & Ryan 1999](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf))
  — one reason the free lane's daily games pay nothing.
