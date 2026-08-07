# Draft Board & Auction Draft System — Design

**Date:** 2026-08-07
**Status:** Approved design, pending implementation plan
**Scope:** First feature of the league website: the live auction draft system (board UI + draft engine) for a League of Legends esports draft league run through Discord.

## Overview

A realtime auction draft board where captains bid points on players to fill role-locked rosters, admins run the draft, and spectators watch live. Deployed on Vercel (Next.js, TypeScript) with Supabase (Postgres, Discord OAuth, Realtime) — free tiers of both. The GitHub repo `SundayKoi/FPL_website` is the source of truth; Vercel deploys from it.

The existing Python venv in the repo folder is deleted — this is a TypeScript project.

## League rules being modeled

- **Auction draft.** Captains take turns nominating players from the pool. A nomination is the nominator's opening bid at the round minimum. Other captains may outbid; each new bid resets a between-bids countdown. When the countdown expires, the highest bidder wins the player at that price.
- **Round minimums:** round 1 opens at 10 points, round 2 at 5, round 3 at 1.
- **A round = one full nomination pass.** Every eligible captain nominates once per round; then the round advances and the minimum drops. A captain may win multiple players in one round by outbidding on others' nominations.
- **Nomination order:** admin sets the order for round 1; the order snakes (reverses) each subsequent round. Captains with full rosters are skipped.
- **Rosters:** 5 players, role-locked (Top / Jungle / Mid / ADC / Support). Each captain enters the draft with 2 roles already filled — themself and one free-agency signing — and drafts exactly 3 players.
- **Role eligibility:** a captain may only nominate or bid on players whose role they still need.
- **Budgets:** each captain starts with an admin-assigned point total (amounts differ per captain and are known before the draft). Bids must raise the current bid by at least 1.
- **Max-bid cap:** a captain must always keep at least 1 point per other unfilled role, so they can never strand themselves unable to fill their roster.
- **No-bid outcome:** if nobody outbids the nominator before the countdown expires, the nominator wins the player at the opening (minimum) bid.

## Architecture

- **Next.js (App Router, TypeScript)** on Vercel — UI and thin API layer only.
- **Supabase** — Postgres (all state + all rules), Auth (Discord OAuth), Realtime (postgres_changes pushed to every open board).
- **All draft rules live in Postgres functions** (`nominate`, `place_bid`, `close_lot`, admin ops). The browser never decides anything; it calls RPCs and renders what Realtime pushes. Postgres row locks make concurrent bids safe.
- **Countdown without a server:** every bid writes `closes_at = now() + countdown_seconds` on the lot. Clients render the countdown from `closes_at` against server time (a server-time offset is fetched once per session; client clocks are never trusted). At zero, any connected client calls `close_lot` — it is idempotent and guarded by a row lock plus a `now() >= closes_at` check, so many simultaneous callers are harmless and the first one finalizes the sale. Page load and Realtime reconnect also attempt to close any expired lot, as a backstop.

### Access roles

| Role | Identified by | Can do |
|---|---|---|
| Admin | `profiles.is_admin` | Everything: setup, run, pause, undo, override |
| Captain | `teams.captain_profile_id` → their Discord login | Nominate on their turn, bid when eligible |
| Spectator | No login | Watch the board live (public read) |

Row Level Security: draft data is publicly readable; all mutations go through `SECURITY DEFINER` RPCs that check the caller's role and the rules. Writes outside RPCs are denied.

## Data model

- **profiles** — `id` (= auth uid), `discord_id`, `display_name`, `avatar_url`, `is_admin`.
- **drafts** — `name`, `status` (`setup | live | paused | complete`), `countdown_seconds` (default 15), `round_minimums` (`[10, 5, 1]`), `current_round`, `current_nominator_team_id`, `paused_time_remaining` (freezes the live lot's clock across pause/resume).
- **teams** — `draft_id`, `name`, `captain_profile_id`, `nomination_position` (round-1 order), `budget_start`, `points_remaining`.
- **players** — `draft_id`, `display_name`, `role`, optional `rank`, `opgg_url`, `notes`; once rostered: `team_id`, `price`, `acquisition` (`captain | free_agency | auction`). Captains and FA signings are rows with `acquisition` pre-set, so role-slot logic is uniform.
- **lots** — one auction of one player: `draft_id`, `player_id`, `nominated_by_team_id`, `round`, `opening_bid`, `current_bid`, `leading_team_id`, `closes_at`, `status` (`open | sold | cancelled`).
- **bids** — full history: `lot_id`, `team_id`, `amount`, `created_at`. Audit trail; enables undo.

## Draft engine (Postgres RPCs)

- **`nominate(draft_id, player_id)`** — caller is the current nominator; draft is `live`; player is available; nominator still needs the player's role; opening bid = current round minimum; opening bid within the nominator's max-bid cap. Creates the lot with the nominator leading and `closes_at` set.
- **`place_bid(lot_id, amount)`** — lot is open and unexpired; caller's team needs the role; `amount >= current_bid + 1`; `amount <= points_remaining − (other unfilled roles × 1)`. Updates the lot, inserts a bid row, resets `closes_at`.
- **`close_lot(lot_id)`** — callable by anyone; no-op unless the lot is open and `now() >= closes_at`. Assigns the player to the leading team at `current_bid`, deducts points, then advances the turn: next captain in snake order who still has open roles; after a full pass, increments the round; when all rosters are full, marks the draft `complete`.
- **Admin RPCs** — `pause` / `resume` (stores and restores time remaining on the open lot), `undo_last_sale` (returns player to pool, refunds points, restores the turn), `cancel_lot` (voids a live lot, nominator keeps the turn), `force_close_lot`, `update_draft_settings` (countdown length), plus setup CRUD (teams, budgets, order, player pool, captain ↔ Discord linking).

All mutating RPCs take `FOR UPDATE` locks on the lot/draft rows, so concurrent calls serialize: of two simultaneous bids, one wins and the other gets a clear "outbid — current bid is now X" error.

## UI

### `/draft/[id]` — the board (one page, three hats)

- **Center stage:** the player up for auction — player card (name, role, rank, op.gg link), large countdown, current bid, leading team, live bid-history feed.
- **Team columns:** each team's five role slots (filled slots show player + price; captain/FA marked), points remaining, and a marker on the current nominator.
- **Player pool panel:** searchable, filterable by role; sold players show buyer and price.
- **Captains also see:** bid controls — quick-bid (+1) and custom amount — disabled with the reason when ineligible (role filled, insufficient points, cap); on their turn, a nomination picker showing only legally nominatable players.
- **Admins also see:** a control strip — pause/resume, undo last sale, cancel lot, force close, countdown setting.
- **Spectators:** the same live board, read-only, no login.
- **Status states:** pre-draft lobby (setup not live), paused banner, and a completion summary (final rosters + prices).

### `/admin` — setup area

Create a draft; create teams with budgets and nomination order; link each team to its captain's Discord account; enter the player pool (form + CSV paste: name, role, rank, op.gg); mark pre-draft roster entries (captain, FA signing); start the draft.

## Edge cases & failure handling

- **Simultaneous bids** — serialized by row locks (above).
- **Timer races** — `close_lot` is idempotent; a bid that lands after expiry but before closing is rejected by the `closes_at` check.
- **Disconnects** — the auction proceeds; admin can pause. Reconnect/refresh rebuilds exact state from the DB. A banner shows when Realtime is disconnected.
- **Clock skew** — countdowns derive from server `closes_at` + fetched server-time offset.
- **Blocked nominations** — a captain can only nominate players they can legally open on; the picker enforces this.
- **Free-tier limits** — Supabase free Realtime (200 concurrent connections) and Vercel free are ample for one league's draft night.

## Testing

- **Engine (most important):** SQL-level tests for the RPCs — simultaneous bids, cap enforcement, nomination legality, snake order with skips, round transitions, no-bid sales, pause/resume clock math, undo.
- **End-to-end:** Playwright smoke test with two browser contexts (two captains) bidding against a local Supabase stack.
- **Unit:** light tests for UI helpers (countdown formatting, eligibility messaging).

## Out of scope (later features)

Player self-signup, match scheduling/results, standings, champion pick/ban, multi-season history, Discord bot integration.
