"""
Offseason tournament stats -> Supabase
======================================
Reads the offseason tournament's reported games (public.offseason_games
rows that carry a Riot match id and have not been ingested yet), pulls each
game from the Riot API with the league ingest's own extraction code
(scripts/riot_stats_ingest.py, imported and reused unchanged), and writes
the rows to public.offseason_stats -- a copy of raw_stats' shape that the
league's own stats, cards and awards never read. Each game is then reported
back through the offseason_record_ingest RPC: when it landed and which team
won, or why it could not be read.

TEMPORARY. This file, scripts/test_offseason_ingest.py and
.github/workflows/offseason-ingest.yml exist only for the offseason event
and can be deleted together once it is over. Nothing else imports them, and
they never write raw_stats.

Team names: players sign up as individuals and are drafted onto fresh teams
every week, so a game's team_name comes from that week's offseason rosters
(offseason_team_members -> offseason_entrants.riot_id), matched to the Riot
participants case-insensitively. A sub who is on neither roster takes the
name most of their side carries, else "Blue"/"Red": the card engine keys
team damage by team_name, so it is never left blank.

Dependencies:
    pip install requests python-dotenv

SETUP:
1. pip install requests python-dotenv
2. Copy .env.example to .env and fill in RIOT_API_KEY, SUPABASE_URL,
   SUPABASE_SERVICE_ROLE_KEY (all three are needed even for --dry-run: the
   pending games are read from Supabase either way).

USAGE:
    # Ingest every pending game:
    python scripts/offseason_ingest.py

    # Only one game (an offseason_games.id), e.g. after staff fix its match id:
    python scripts/offseason_ingest.py --game 5b0c7c64-0d0e-4d7e-9a53-2f1c0f7f7a11

    # Dry run (reads Supabase and calls the Riot API, prints what it would
    # write, writes nothing -- no stats rows, no RPC):
    python scripts/offseason_ingest.py --dry-run

Exits 1 if any game failed (its error is recorded on the game for staff to
see), if the pending games could not be read, or if the environment is
incomplete; 0 otherwise. Re-running is safe: the stats insert ignores rows
already present, and an ingested game is no longer pending.
"""

import argparse
import json
import sys
import time
import uuid
from collections import Counter

import requests

import riot_stats_ingest as ris

# ============================================================
# CONFIG
# ============================================================

SEASON = "OFFSEASON"
SEASON_PHASE = "Offseason"

OFFSEASON_GAMES_ENDPOINT = "/rest/v1/offseason_games"
OFFSEASON_MATCHES_ENDPOINT = "/rest/v1/offseason_matches"
OFFSEASON_TEAMS_ENDPOINT = "/rest/v1/offseason_teams"
OFFSEASON_TEAM_MEMBERS_ENDPOINT = "/rest/v1/offseason_team_members"
OFFSEASON_STATS_ENDPOINT = "/rest/v1/offseason_stats"
RECORD_INGEST_RPC = "/rest/v1/rpc/offseason_record_ingest"

REQUEST_TIMEOUT = 30  # seconds, for Supabase calls

SIDES = ("Blue", "Red")


class SupabaseReadError(Exception):
    """A PostgREST read the whole run depends on failed."""


# ============================================================
# SUPABASE READS
# ============================================================


def _in_filter(values):
    return "in.(" + ",".join(str(v) for v in values) + ")"


def _get_rows(cfg, endpoint, params, what):
    """GET a PostgREST endpoint and return its rows, raising
    SupabaseReadError (with `what` in the message) on any failure."""
    url = f"{cfg.supabase_url.rstrip('/')}{endpoint}"
    try:
        resp = requests.get(
            url, headers=ris._supabase_headers(cfg.service_key), params=params, timeout=REQUEST_TIMEOUT
        )
    except requests.RequestException as exc:
        raise SupabaseReadError(f"Could not read {what}: request error: {exc}") from exc
    if resp.status_code != 200:
        raise SupabaseReadError(f"Could not read {what}: HTTP {resp.status_code}: {resp.text[:200]}")
    try:
        rows = resp.json()
    except ValueError as exc:
        raise SupabaseReadError(f"Could not read {what}: response was not JSON") from exc
    if not isinstance(rows, list):
        raise SupabaseReadError(f"Could not read {what}: expected a list of rows")
    return rows


def fetch_pending_games(cfg, game_id=None):
    """offseason_games rows with a Riot match id that have not been
    ingested, oldest match first. `game_id` narrows it to that one game."""
    params = {
        "select": "id,match_id,game_number,riot_match_id",
        "riot_match_id": "not.is.null",
        "ingested_at": "is.null",
        "order": "match_id.asc,game_number.asc",
    }
    if game_id:
        params["id"] = f"eq.{game_id}"
    return _get_rows(cfg, OFFSEASON_GAMES_ENDPOINT, params, "pending offseason games")


def load_matches(cfg, match_ids):
    """{offseason_matches.id: row} for `match_ids`, in one request."""
    ids = sorted({m for m in match_ids if m})
    if not ids:
        return {}
    rows = _get_rows(
        cfg,
        OFFSEASON_MATCHES_ENDPOINT,
        {"select": "id,team_a_id,team_b_id,week_id", "id": _in_filter(ids)},
        "offseason matches",
    )
    return {row["id"]: row for row in rows}


def load_team_names(cfg, team_ids):
    """{offseason_teams.id: name} for `team_ids`, in one request."""
    ids = sorted({t for t in team_ids if t})
    if not ids:
        return {}
    rows = _get_rows(
        cfg, OFFSEASON_TEAMS_ENDPOINT, {"select": "id,name", "id": _in_filter(ids)}, "offseason teams"
    )
    return {row["id"]: row.get("name") for row in rows}


def load_rosters(cfg, team_ids):
    """{offseason_teams.id: [riot_id, ...]} for `team_ids`, in one request
    (offseason_team_members embedding each member's entrant)."""
    ids = sorted({t for t in team_ids if t})
    if not ids:
        return {}
    rows = _get_rows(
        cfg,
        OFFSEASON_TEAM_MEMBERS_ENDPOINT,
        {"select": "team_id,offseason_entrants(riot_id)", "team_id": _in_filter(ids)},
        "offseason team members",
    )
    rosters = {}
    for row in rows:
        riot_id = ((row.get("offseason_entrants") or {}).get("riot_id") or "").strip()
        if riot_id:
            rosters.setdefault(row.get("team_id"), []).append(riot_id)
    return rosters


# ============================================================
# MAPPING (pure -- no I/O)
# ============================================================


def _riot_key(game_name, tag_line):
    return ((game_name or "").strip().lower(), (tag_line or "").strip().lower())


def build_team_map(members, match_data=None):
    """{"Name#TAG": team_name} for riot_stats_ingest.extract_stats.

    `members` is [(riot_id, team_name), ...] from the two teams' rosters.
    extract_stats looks a participant up by the exact string
    f"{riotIdGameName}#{riotIdTagline}", so matching is done here, case- and
    whitespace-insensitively, and the map is keyed by each participant's own
    spelling from `match_data` (plus the roster's spelling, which is what a
    caller without match data gets). A Riot ID rostered on both teams names
    neither: the side-majority fill decides it instead of a guess."""
    by_key = {}
    conflicted = set()
    spelled = {}
    for riot_id, team_name in members:
        game_name, sep, tag_line = (riot_id or "").partition("#")
        if not sep or not team_name:
            continue
        key = _riot_key(game_name, tag_line)
        if not key[0] or not key[1]:
            continue
        if key in by_key and by_key[key] != team_name:
            conflicted.add(key)
        by_key[key] = team_name
        spelled[key] = f"{game_name.strip()}#{tag_line.strip()}"
    for key in conflicted:
        by_key.pop(key, None)

    team_map = {spelled[key]: team for key, team in by_key.items()}
    participants = ((match_data or {}).get("info") or {}).get("participants") or []
    for p in participants:
        # Mirrors extract_stats' own summoner_name/tag derivation exactly.
        game_name = p.get("riotIdGameName", p.get("summonerName", "Unknown"))
        tag_line = p.get("riotIdTagline", "")
        team = by_key.get(_riot_key(game_name, tag_line))
        if team:
            team_map[f"{game_name}#{tag_line}"] = team
    return team_map


def fill_blank_team_names(rows):
    """Give every row a team_name, in place: a blank one takes the most
    common non-blank team_name on its own team_side, else the side itself
    ("Blue"/"Red"). Returns the rows that were filled."""
    by_side = {}
    for row in rows:
        name = row.get("team_name")
        if name:
            by_side.setdefault(row.get("team_side"), Counter())[name] += 1
    filled = []
    for row in rows:
        if row.get("team_name"):
            continue
        filled.append(row)
        side = row.get("team_side")
        counts = by_side.get(side)
        if counts:
            row["team_name"] = counts.most_common(1)[0][0]
        else:
            row["team_name"] = side if side in SIDES else "Blue"
    return filled


def resolve_winner(rows, teams):
    """The offseason team id whose name is on the winning rows, or None.

    `teams` is {team_id: name} for the match's two teams. Resolves only when
    the winning rows name exactly one of them and the losing rows do not
    name that same team; anything murkier (duplicate team names, a remake
    with no winner, a roster mix-up) returns None and staff enter it."""
    by_name = {}
    for team_id, name in teams.items():
        key = (name or "").strip().lower()
        if not key or key in by_name:
            return None
        by_name[key] = team_id
    winners, losers = set(), set()
    for row in rows:
        team_id = by_name.get((row.get("team_name") or "").strip().lower())
        if team_id is None:
            continue
        (winners if row.get("win") else losers).add(team_id)
    if len(winners) == 1 and not winners & losers:
        return next(iter(winners))
    return None


# ============================================================
# SUPABASE WRITES
# ============================================================


def write_offseason_stats(cfg, rows):
    """POST rows to offseason_stats in WRITE_BATCH_SIZE batches, ignoring
    rows already present (match_id, summoner_name). Returns None on
    success, else a short error message."""
    url = f"{cfg.supabase_url.rstrip('/')}{OFFSEASON_STATS_ENDPOINT}?on_conflict=match_id,summoner_name"
    headers = ris._supabase_headers(cfg.service_key, {
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
    })
    batches = ris.chunk(rows, ris.WRITE_BATCH_SIZE)
    for i, batch in enumerate(batches, 1):
        try:
            resp = requests.post(url, headers=headers, data=json.dumps(batch), timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            return f"Writing stats failed (batch {i}/{len(batches)}): request error: {exc}"
        if resp.status_code not in (200, 201, 204):
            return f"Writing stats failed (batch {i}/{len(batches)}): HTTP {resp.status_code}: {resp.text[:200]}"
    return None


def record_ingest(cfg, game_id, error, winner_team_id):
    """Report one game through offseason_record_ingest. Returns True/False;
    never raises."""
    url = f"{cfg.supabase_url.rstrip('/')}{RECORD_INGEST_RPC}"
    headers = ris._supabase_headers(cfg.service_key, {"Content-Type": "application/json"})
    body = {"p_game_id": game_id, "p_error": error, "p_winner_team_id": winner_team_id}
    try:
        resp = requests.post(url, headers=headers, data=json.dumps(body), timeout=REQUEST_TIMEOUT)
    except requests.RequestException as exc:
        print(f"  [ERROR] Could not record ingest for game {game_id}: request error: {exc}")
        return False
    if resp.status_code not in (200, 204):
        print(f"  [ERROR] Could not record ingest for game {game_id}: HTTP {resp.status_code}: {resp.text[:200]}")
        return False
    return True


# ============================================================
# ONE GAME
# ============================================================


class GameError(Exception):
    """A game that cannot be ingested; the message is recorded on it."""


def fetch_game_rows(cfg, game, match, team_names, rosters):
    """Fetch one game from Riot and map it to offseason_stats rows with every
    team_name filled. Returns (rows, teams) where teams is {team_id: name}
    for the match's two teams; raises GameError with a short message."""
    riot_match_id = game["riot_match_id"]
    if not match:
        raise GameError(f"Match {game.get('match_id')} not found.")
    teams = {tid: team_names.get(tid) for tid in (match.get("team_a_id"), match.get("team_b_id"))}
    missing = [str(tid) for tid, name in teams.items() if not name]
    if missing:
        raise GameError(f"Team(s) not found: {', '.join(missing)}.")

    try:
        match_data = ris.get_match_details(riot_match_id, cfg.riot_api_key)
        time.sleep(ris.API_DELAY)
        if not match_data:
            raise GameError(f"Could not fetch {riot_match_id} from the Riot API (wrong id, or not published yet).")
        members = [(riot_id, teams[tid]) for tid in teams for riot_id in rosters.get(tid, [])]
        rows = ris.fetch_and_extract(
            riot_match_id,
            match_data,
            cfg.riot_api_key,
            season=SEASON,
            season_phase=SEASON_PHASE,
            team_map=build_team_map(members, match_data),
        )
    except requests.RequestException as exc:
        raise GameError(f"Riot API request failed for {riot_match_id}: {type(exc).__name__}.") from exc
    if not rows:
        raise GameError(f"{riot_match_id} has no participants to record.")

    for row in fill_blank_team_names(rows):
        print(f"  [WARN] {row['summoner_name']}#{row['tag']} is on neither roster -- recorded as {row['team_name']!r}.")
    by_side = {}
    for row in rows:
        by_side.setdefault(row["team_side"], Counter())[row["team_name"]] += 1
    print("  " + " | ".join(f"{side}: {', '.join(by_side[side])}" for side in sorted(by_side)))
    return rows, teams


def ingest_game(cfg, game, match, team_names, rosters):
    """Ingest one offseason game end to end and report it through the RPC
    (not under --dry-run). Never raises. Returns
    {"status": "ingested" | "dry_run" | "failed", "rows": int,
     "winner_team_id": str | None, "error": str | None}."""
    result = {"status": "failed", "rows": 0, "winner_team_id": None, "error": None}
    try:
        rows, teams = fetch_game_rows(cfg, game, match, team_names, rosters)
        result["rows"] = len(rows)
        winner_team_id = resolve_winner(rows, teams)
        if cfg.dry_run:
            result.update(status="dry_run", winner_team_id=winner_team_id)
            return result
        error = write_offseason_stats(cfg, rows)
        if error:
            raise GameError(error)
    except GameError as exc:
        result["error"] = str(exc)
    except Exception as exc:  # noqa: BLE001 -- one bad game must not stop the rest
        result["error"] = f"Unexpected error: {type(exc).__name__}: {exc}"[:300]

    if result["error"] is not None:
        if not cfg.dry_run:
            record_ingest(cfg, game["id"], result["error"], None)
        return result

    result["winner_team_id"] = winner_team_id
    if record_ingest(cfg, game["id"], None, winner_team_id):
        result["status"] = "ingested"
    else:
        result["error"] = "Stats were written but the ingest could not be recorded; re-run to retry."
    return result


# ============================================================
# RUN
# ============================================================


def run(cfg, game_id=None):
    """Ingest every pending game (or just `game_id`). Returns the exit code."""
    print("OFFSEASON INGEST -- reported offseason games -> offseason_stats")
    print("=" * 60 + "\n")

    try:
        games = fetch_pending_games(cfg, game_id)
        if not games:
            if game_id:
                print(f"Game {game_id} is not pending (no Riot match id yet, already ingested, or no such game).")
            else:
                print("No pending offseason games to ingest.")
            return 0
        matches = load_matches(cfg, [g.get("match_id") for g in games])
        team_ids = [t for m in matches.values() for t in (m.get("team_a_id"), m.get("team_b_id"))]
        team_names = load_team_names(cfg, team_ids)
        rosters = load_rosters(cfg, team_ids)
    except SupabaseReadError as exc:
        print(f"[ERROR] {exc}")
        return 1

    print(f"Found {len(games)} pending game(s).\n")
    print("Loading champion ID mappings from Data Dragon...")
    ris.CHAMPION_ID_MAP = ris.fetch_champion_id_map()
    print()

    failed = 0
    for i, game in enumerate(games, 1):
        match = matches.get(game.get("match_id")) or {}
        team_a = team_names.get(match.get("team_a_id")) or "?"
        team_b = team_names.get(match.get("team_b_id")) or "?"
        print(f"[{i}/{len(games)}] {team_a} vs {team_b}, game {game.get('game_number')} ({game['riot_match_id']})")
        result = ingest_game(cfg, game, match or None, team_names, rosters)
        winner = team_names.get(result["winner_team_id"]) if result["winner_team_id"] else "unresolved"
        if result["status"] == "ingested":
            print(f"  -> ingested {result['rows']} row(s); winner: {winner}")
        elif result["status"] == "dry_run":
            print(f"  -> [DRY RUN] would write {result['rows']} row(s); winner: {winner}")
        else:
            failed += 1
            print(f"  -> FAILED: {result['error']}")
        print()

    if cfg.dry_run:
        print("[DRY RUN] Nothing was written to Supabase.")
    if failed:
        print(f"[ERROR] {failed} of {len(games)} game(s) failed; see the errors above (a real run also records")
        print("        each on its game for staff). Fix the cause -- often a wrong match id, or Riot not")
        print("        publishing the game yet -- and re-run; rows that already landed are skipped.")
        return 1
    return 0


# ============================================================
# CLI / MAIN
# ============================================================


def _uuid_arg(value):
    try:
        return str(uuid.UUID(value.strip()))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"not a game id (uuid): {value!r}") from exc


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Ingest the offseason tournament's reported games from the Riot API into "
        "public.offseason_stats, and record each result via offseason_record_ingest."
    )
    parser.add_argument(
        "--game",
        type=_uuid_arg,
        metavar="GAME_ID",
        help="Only this offseason_games.id (it must still be pending: a Riot match id and not ingested).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read the pending games and fetch them from Riot, print what would be written, and write "
        "nothing (no stats rows, no RPC). Still needs all three env vars.",
    )
    return parser


def main(argv=None):
    args = build_arg_parser().parse_args(argv)

    env = ris.require_env(ris.REQUIRED_ENV_VARS)
    if env is None:
        return 1
    cfg = ris.IngestConfig(
        supabase_url=env["SUPABASE_URL"],
        service_key=env["SUPABASE_SERVICE_ROLE_KEY"],
        riot_api_key=env["RIOT_API_KEY"],
        dry_run=args.dry_run,
    )
    return run(cfg, args.game)


if __name__ == "__main__":
    sys.exit(main())
