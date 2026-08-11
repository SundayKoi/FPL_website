"""
Riot Inhouse Stats -> Supabase
====================================
Pulls match stats from the Riot API (either by explicit match ids, or by
looking up player Riot IDs and filtering for custom/tournament games in a
date window), maps each participant row onto the 137 columns of
`public.raw_stats` (see `supabase/migrations/20260810100001_raw_stats.sql`,
which is the authoritative column list/order), and POSTs them to Supabase
via the PostgREST bulk-insert endpoint with on-conflict-ignore on
(match_id, summoner_name).

This replaces the old Google-Sheets-based `updated_stats.py` script. All
Riot extraction logic (match details, timeline parsing, bans, objectives,
extract_stats) is ported as-is; the Google Sheets/gspread code is gone.

Dependencies (not installed globally by this repo -- pip install locally
if you plan to run this for real):
    pip install requests python-dotenv

SETUP:
1. pip install requests python-dotenv
2. Copy .env.example to .env and fill in RIOT_API_KEY, SUPABASE_URL,
   SUPABASE_SERVICE_ROLE_KEY.
3. Add player Riot IDs to the PLAYER_RIOT_IDS list below (used only in
   --dates discovery mode).

USAGE:
    # Explicit match ids, writes to Supabase:
    python scripts/riot_stats_ingest.py NA1_123 NA1_456 --season S5 --phase Regular

    # Date-window discovery mode (looks up PLAYER_RIOT_IDS' match history,
    # keeps games that look like customs/tournament games inside the
    # window(s) built from the given dates):
    python scripts/riot_stats_ingest.py --dates 2026-08-11 2026-08-18 --season S5 --phase Regular

    # Dry run (no network write to Supabase; still calls the Riot API to
    # fetch match data, then prints the first mapped row + row count):
    python scripts/riot_stats_ingest.py NA1_123 --dry-run

    # OPTIONAL: fill in team_name from a JSON map of
    # {"SummonerName#TAG": "FPL Team"} instead of leaving it blank (see
    # README's Stats ingestion section for the file shape and the backfill
    # alternative if you skip this):
    python scripts/riot_stats_ingest.py NA1_123 --season S5 --phase Regular --team-map team_map.json

Without python-dotenv installed, `.env` values are read via a tiny
fallback parser (KEY=VALUE lines, no interpolation/quoting support) so
that --dry-run and the test file still work without the dependency. See
`_load_env()` below.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

try:
    from dotenv import load_dotenv

    _HAS_DOTENV = True
except ImportError:
    _HAS_DOTENV = False

# ============================================================
# CONFIG
# ============================================================

REGION = "americas"

PLAYER_RIOT_IDS = [
    "AfkBoulder#c9win",
    "DeFaux#ttm",
    "MetaShift#2281",
    "Sunset Diner#na1",
    "Conguitos0#01203",
    "YWGI#Rain",
]

GAME_DAY = 0  # Monday

GAME_TIMEZONE_OFFSET = -5  # EST
CUSTOM_QUEUE_IDS = [3130]
API_DELAY = 1.5

TIMELINE_INTERVALS = [5, 10, 15, 20]

RAW_STATS_ENDPOINT = "/rest/v1/raw_stats"
WRITE_BATCH_SIZE = 100

# ============================================================
# ENV LOADING
# ============================================================


def _load_env():
    """Load .env into os.environ. Uses python-dotenv when available;
    otherwise falls back to a minimal KEY=VALUE parser so --dry-run and
    the test file keep working without the dependency installed."""
    if _HAS_DOTENV:
        load_dotenv()
        return
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    env_path = os.path.normpath(env_path)
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


REQUIRED_ENV_VARS = ["RIOT_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]


def require_env(names):
    """Return {name: value} for `names`, or None + print a refusal listing
    exactly which names are missing (does not exit -- caller decides)."""
    _load_env()
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        print("[ERROR] Missing required environment variable(s): " + ", ".join(missing))
        print("        Set them in .env (see .env.example) or your shell environment.")
        return None
    return {n: os.environ[n] for n in names}


# ============================================================
# CHAMPION ID -> NAME MAPPING (for resolving ban championIds)
# ============================================================

CHAMPION_ID_MAP = {}


def fetch_champion_id_map():
    """Fetch champion ID to name mapping from Riot Data Dragon."""
    try:
        versions_url = "https://ddragon.leagueoflegends.com/api/versions.json"
        resp = requests.get(versions_url, timeout=10)
        latest_version = resp.json()[0]

        champ_url = f"https://ddragon.leagueoflegends.com/cdn/{latest_version}/data/en_US/champion.json"
        resp = requests.get(champ_url, timeout=10)
        champ_data = resp.json()["data"]

        id_to_name = {}
        for champ_name, champ_info in champ_data.items():
            champ_id = int(champ_info["key"])
            id_to_name[champ_id] = champ_name

        print(f"  Loaded {len(id_to_name)} champion ID mappings (patch {latest_version})")
        return id_to_name
    except Exception as e:
        print(f"  [WARN] Could not fetch champion ID map: {e}")
        return {}


# ============================================================
# RIOT API FUNCTIONS
# ============================================================


def _riot_headers(riot_api_key):
    return {"X-Riot-Token": riot_api_key}


def get_game_time_windows(day_of_week, target_dates=None):
    tz = timezone(timedelta(hours=GAME_TIMEZONE_OFFSET))
    windows = []
    if target_dates:
        for date_str in target_dates:
            target_day = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=tz)
            start = target_day.replace(hour=12, minute=0, second=0, microsecond=0)
            end = (target_day + timedelta(days=1)).replace(hour=5, minute=0, second=0, microsecond=0)
            windows.append((int(start.timestamp()), int(end.timestamp())))
    else:
        today = datetime.now(tz)
        days_since = (today.weekday() - day_of_week) % 7
        if days_since == 0 and today.hour < 12:
            days_since = 7
        target_day = today - timedelta(days=days_since)
        start = target_day.replace(hour=12, minute=0, second=0, microsecond=0)
        end = (target_day + timedelta(days=1)).replace(hour=5, minute=0, second=0, microsecond=0)
        windows.append((int(start.timestamp()), int(end.timestamp())))
    windows.sort(key=lambda w: w[0])
    return windows


def get_puuid_from_riot_id(riot_id, riot_api_key):
    parts = riot_id.split("#")
    if len(parts) != 2:
        print(f"  [ERROR] Invalid Riot ID format: '{riot_id}'")
        return None
    game_name, tag_line = parts
    url = f"https://{REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
    resp = requests.get(url, headers=_riot_headers(riot_api_key))
    if resp.status_code == 200:
        return resp.json().get("puuid")
    else:
        print(f"  [ERROR] Failed to look up '{riot_id}': {resp.status_code}")
        return None


def get_all_match_ids(puuid, earliest_timestamp, riot_api_key):
    all_ids = []
    start_index = 0
    batch_size = 99
    while True:
        url = f"https://{REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids"
        params = {"start": start_index, "count": batch_size}
        resp = requests.get(url, headers=_riot_headers(riot_api_key), params=params)
        time.sleep(API_DELAY)
        if resp.status_code != 200:
            break
        batch = resp.json()
        if not batch:
            break
        all_ids.extend(batch)
        print(f"    Fetched {len(batch)} matches (total: {len(all_ids)})")
        last_match_url = f"https://{REGION}.api.riotgames.com/lol/match/v5/matches/{batch[-1]}"
        last_resp = requests.get(last_match_url, headers=_riot_headers(riot_api_key))
        time.sleep(API_DELAY)
        if last_resp.status_code == 200:
            last_ts = last_resp.json().get("info", {}).get("gameStartTimestamp", 0) / 1000
            if last_ts < earliest_timestamp:
                break
        if len(batch) < batch_size:
            break
        start_index += batch_size
    return all_ids


def get_match_details(match_id, riot_api_key):
    url = f"https://{REGION}.api.riotgames.com/lol/match/v5/matches/{match_id}"
    resp = requests.get(url, headers=_riot_headers(riot_api_key))
    if resp.status_code == 200:
        return resp.json()
    else:
        print(f"  [ERROR] Match details failed for '{match_id}': {resp.status_code}")
        return None


def is_inhouse_game(match_data, windows):
    info = match_data.get("info", {})
    queue_id = info.get("queueId", -1)
    game_type = info.get("gameType", "")
    is_custom = queue_id in CUSTOM_QUEUE_IDS or game_type == "CUSTOM_GAME"
    if not is_custom:
        return False
    game_start = info.get("gameStartTimestamp", 0) / 1000
    for start_time, end_time in windows:
        if start_time <= game_start <= end_time:
            return True
    return False


# ============================================================
# TIMELINE DATA
# ============================================================


def get_match_timeline(match_id, riot_api_key):
    url = f"https://{REGION}.api.riotgames.com/lol/match/v5/matches/{match_id}/timeline"
    resp = requests.get(url, headers=_riot_headers(riot_api_key))
    time.sleep(API_DELAY)
    if resp.status_code == 200:
        return resp.json()
    else:
        print(f"  [WARN] Could not fetch timeline for {match_id}: {resp.status_code}")
        return None


def parse_timeline_data(timeline_data):
    solo_kills = {}
    interval_stats = {}
    turret_plates = {}
    first_blood_info = None
    level6_timestamps = {}
    if not timeline_data:
        return solo_kills, interval_stats, turret_plates, first_blood_info, level6_timestamps
    frames = timeline_data.get("info", {}).get("frames", [])
    for frame in frames:
        timestamp_ms = frame.get("timestamp", 0)
        minute = round(timestamp_ms / 60000)
        if minute in TIMELINE_INTERVALS:
            participant_frames = frame.get("participantFrames", {})
            for pid_str, pf in participant_frames.items():
                pid = int(pid_str)
                cs = pf.get("minionsKilled", 0) + pf.get("jungleMinionsKilled", 0)
                gold = pf.get("totalGold", 0)
                xp = pf.get("xp", 0)
                if pid not in interval_stats:
                    interval_stats[pid] = {}
                if minute not in interval_stats[pid]:
                    interval_stats[pid][minute] = {"cs": cs, "gold": gold, "xp": xp}
        for event in frame.get("events", []):
            event_type = event.get("type")
            if event_type == "CHAMPION_KILL":
                killer_id = event.get("killerId", 0)
                assisting = event.get("assistingParticipantIds", [])
                if killer_id > 0 and len(assisting) == 0:
                    solo_kills[killer_id] = solo_kills.get(killer_id, 0) + 1
            if event_type == "CHAMPION_SPECIAL_KILL":
                kill_type = event.get("killType", "")
                if kill_type == "KILL_FIRST_BLOOD" and first_blood_info is None:
                    first_blood_info = {
                        "killerId": event.get("killerId", 0),
                        "timestamp_min": round(event.get("timestamp", 0) / 60000, 1),
                    }
            if event_type == "TURRET_PLATE_DESTROYED":
                destroyer_id = event.get("killerId", 0)
                if destroyer_id > 0:
                    turret_plates[destroyer_id] = turret_plates.get(destroyer_id, 0) + 1
            if event_type == "LEVEL_UP":
                level = event.get("level", 0)
                pid = event.get("participantId", 0)
                if level == 6 and pid > 0 and pid not in level6_timestamps:
                    level6_timestamps[pid] = round(event.get("timestamp", 0) / 60000, 1)
    return solo_kills, interval_stats, turret_plates, first_blood_info, level6_timestamps


# ============================================================
# TEAM OBJECTIVES & BANS
# ============================================================


def get_team_objectives(match_data):
    teams = match_data.get("info", {}).get("teams", [])
    team_obj = {}
    for team in teams:
        team_id = team.get("teamId")
        objectives = team.get("objectives", {})
        team_obj[team_id] = {
            "dragons": objectives.get("dragon", {}).get("kills", 0),
            "firstDragon": objectives.get("dragon", {}).get("first", False),
            "barons": objectives.get("baron", {}).get("kills", 0),
            "firstBaron": objectives.get("baron", {}).get("first", False),
            "heralds": objectives.get("riftHerald", {}).get("kills", 0),
            "firstHerald": objectives.get("riftHerald", {}).get("first", False),
            "grubs": objectives.get("horde", {}).get("kills", 0),
            "firstGrubs": objectives.get("horde", {}).get("first", False),
            "towers": objectives.get("tower", {}).get("kills", 0),
            "firstTower": objectives.get("tower", {}).get("first", False),
            "inhibitors": objectives.get("inhibitor", {}).get("kills", 0),
            "firstInhibitor": objectives.get("inhibitor", {}).get("first", False),
            "atakhan": objectives.get("atakhan", {}).get("kills", 0),
            "firstBlood": objectives.get("champion", {}).get("first", False),
            "teamKills": objectives.get("champion", {}).get("kills", 0),
        }
    return team_obj


def get_team_bans(match_data):
    """
    Extract bans from match data.
    Riot API: match_data.info.teams[].bans[] = [{championId, pickTurn}]
    Returns: {teamId: [list of champion names]}
    """
    teams = match_data.get("info", {}).get("teams", [])
    team_bans = {}
    for team in teams:
        team_id = team.get("teamId")
        bans = team.get("bans", [])
        ban_names = []
        for ban in bans:
            champ_id = ban.get("championId", -1)
            if champ_id > 0 and champ_id in CHAMPION_ID_MAP:
                ban_names.append(CHAMPION_ID_MAP[champ_id])
            elif champ_id > 0:
                ban_names.append(f"ChampID_{champ_id}")
            # championId of -1 means no ban was made
        team_bans[team_id] = ban_names
    return team_bans


def compute_team_totals(participants):
    team_totals = {}
    for p in participants:
        team_id = p.get("teamId", 100)
        if team_id not in team_totals:
            team_totals[team_id] = {"kills": 0, "damage": 0, "gold": 0}
        team_totals[team_id]["kills"] += p.get("kills", 0)
        team_totals[team_id]["damage"] += p.get("totalDamageDealtToChampions", 0)
        team_totals[team_id]["gold"] += p.get("goldEarned", 0)
    return team_totals


# ============================================================
# COLUMN LIST (public.raw_stats, authoritative order --
# supabase/migrations/20260810100001_raw_stats.sql)
# ============================================================

RAW_STATS_COLUMNS = [
    "game_date",
    "match_id",
    "game_duration_min",
    "team_side",
    "team_name",
    "summoner_name",
    "tag",
    "champion",
    "role",
    "champion_level",
    "kills",
    "deaths",
    "assists",
    "kda",
    "solo_kills",
    "kill_participation_pct",
    "double_kills",
    "triple_kills",
    "quadra_kills",
    "penta_kills",
    "largest_multi_kill",
    "largest_killing_spree",
    "first_blood_kill",
    "first_blood_assist",
    "total_damage_to_champions",
    "damage_per_min",
    "damage_share_pct",
    "physical_damage",
    "magic_damage",
    "true_damage",
    "largest_critical_strike",
    "damage_per_gold",
    "damage_taken",
    "damage_taken_per_min",
    "damage_mitigated",
    "total_healing",
    "healing_on_teammates",
    "shielding_on_teammates",
    "time_ccing_others_s",
    "total_cc_dealt_s",
    "gold_earned",
    "gold_per_min",
    "gold_share_pct",
    "gold_spent",
    "consumables_purchased",
    "items_purchased",
    "cs",
    "cs_per_min",
    "lane_minions_killed",
    "neutral_minions_killed",
    "cs_at_5",
    "cs_at_10",
    "cs_at_15",
    "cs_at_20",
    "gold_at_5",
    "gold_at_10",
    "gold_at_15",
    "gold_at_20",
    "xp_at_5",
    "xp_at_10",
    "xp_at_15",
    "xp_at_20",
    "turret_plates_destroyed",
    "level_6_timing_min",
    "vision_score",
    "vision_score_per_min",
    "wards_placed",
    "wards_killed",
    "control_wards_bought",
    "detector_wards_placed",
    "stealth_wards_placed",
    "turret_kills",
    "turret_damage",
    "objective_damage",
    "inhibitor_kills",
    "nexus_kills",
    "objectives_stolen",
    "objectives_stolen_assists",
    "baron_kills",
    "dragon_kills",
    "spell1_casts_q",
    "spell2_casts_w",
    "spell3_casts_e",
    "spell4_casts_r",
    "summoner1_casts",
    "summoner2_casts",
    "longest_time_alive_s",
    "total_time_dead_s",
    "lane_minions_first_10_min",
    "jungle_cs_before_10_min",
    "max_cs_advantage_on_lane_opponent",
    "max_level_lead_on_lane_opponent",
    "skillshots_hit",
    "skillshots_dodged",
    "damage_per_minute_challenges",
    "team_damage_pct",
    "kda_challenges",
    "kill_participation_challenges",
    "effective_heal_and_shield",
    "bounty_gold",
    "vision_score_advantage_over_lane_opponent",
    "control_wards_placed_challenges",
    "wards_guarded",
    "first_turret_killed",
    "first_turret_killed_assist",
    "turret_plates_taken_challenges",
    "solo_turrets_late_game",
    "turret_takedowns",
    "game_ended_in_surrender",
    "game_ended_in_early_surrender",
    "all_in_pings",
    "assist_me_pings",
    "danger_pings",
    "enemy_missing_pings",
    "enemy_vision_pings",
    "on_my_way_pings",
    "push_pings",
    "need_vision_pings",
    "team_dragons",
    "team_first_dragon",
    "team_barons",
    "team_first_baron",
    "team_heralds",
    "team_first_herald",
    "team_grubs",
    "team_first_grubs",
    "team_towers",
    "team_first_tower",
    "team_first_blood",
    "win",
    # NOTE: the migration's physical column order is season_phase, season
    # (reversed from the legacy sheet's Season, Season Phase header order).
    # This list follows the migration -- it is the authoritative order for
    # POST payload keys, but since we write dicts (not positional arrays)
    # the wire order doesn't actually matter; only the season/season_phase
    # *values* below need to land in the right dict key.
    "season_phase",
    "season",
    "ban_1",
    "ban_2",
    "ban_3",
    "ban_4",
    "ban_5",
]

assert len(RAW_STATS_COLUMNS) == 137, f"expected 137 columns, got {len(RAW_STATS_COLUMNS)}"

# Columns whose values are boolean in the DB (see migration). Every other
# column is left as-is (numeric or text).
BOOLEAN_COLUMNS = {
    "first_blood_kill",
    "first_blood_assist",
    "first_turret_killed",
    "first_turret_killed_assist",
    "game_ended_in_surrender",
    "game_ended_in_early_surrender",
    "team_first_dragon",
    "team_first_baron",
    "team_first_herald",
    "team_first_grubs",
    "team_first_tower",
    "team_first_blood",
    "win",
}


def _blank_to_none(value):
    """The legacy sheet used "" for blanks; map that (and None) to None."""
    if value == "" or value is None:
        return None
    return value


def _to_bool_or_none(value):
    """Booleans in the source data show up as Python bool, "Yes"/"No",
    "Win"/"Loss", or already-blank. Normalize all of those to True/False/None."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("yes", "win", "true"):
            return True
        if lowered in ("no", "loss", "false"):
            return False
    return bool(value)


# ============================================================
# STAT EXTRACTION
# ============================================================


def load_team_map(path):
    """Load an OPTIONAL --team-map JSON file: {"SummonerName#TAG": "FPL Team"}.
    Returns {} if `path` is falsy. Raises on a missing file or invalid JSON
    -- an explicitly-requested team map that can't be read should fail loud,
    not silently fall back to writing null team_name for every row."""
    if not path:
        return {}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"--team-map file {path!r} must contain a JSON object, got {type(data).__name__}")
    return data


def extract_stats(
    match_data,
    solo_kills=None,
    interval_stats=None,
    turret_plates=None,
    first_blood_info=None,
    level6_timestamps=None,
    season=None,
    season_phase=None,
    team_map=None,
):
    """Return a list of dicts (one per participant), keyed by
    RAW_STATS_COLUMNS, ready to POST to Supabase's raw_stats table.

    `team_map` (optional): {"SummonerName#TAG": "FPL Team"} -- when a
    participant's "riotIdGameName#riotIdTagline" key is present, its
    team_name column is filled in from the map instead of being left
    blank. See README's Stats ingestion section for why this can't be
    derived from Riot match data alone."""
    if solo_kills is None:
        solo_kills = {}
    if interval_stats is None:
        interval_stats = {}
    if turret_plates is None:
        turret_plates = {}
    if level6_timestamps is None:
        level6_timestamps = {}
    if team_map is None:
        team_map = {}

    rows = []
    info = match_data.get("info", {})
    match_id = match_data.get("metadata", {}).get("matchId", "Unknown")
    game_duration_min = round(info.get("gameDuration", 0) / 60, 1)

    tz = timezone(timedelta(hours=GAME_TIMEZONE_OFFSET))
    game_start = info.get("gameStartTimestamp", 0) / 1000
    game_date = datetime.fromtimestamp(game_start, tz=tz).strftime("%Y-%m-%d %I:%M %p")

    team_obj = get_team_objectives(match_data)
    team_bans = get_team_bans(match_data)
    participants = info.get("participants", [])
    team_totals = compute_team_totals(participants)

    for p in participants:
        kills = p.get("kills", 0)
        deaths = p.get("deaths", 0)
        assists = p.get("assists", 0)
        lane_cs = p.get("totalMinionsKilled", 0)
        jungle_cs = p.get("neutralMinionsKilled", 0)
        cs = lane_cs + jungle_cs
        damage = p.get("totalDamageDealtToChampions", 0)
        gold = p.get("goldEarned", 0)

        kda = round((kills + assists) / max(deaths, 1), 2)
        cs_per_min = round(cs / max(game_duration_min, 1), 1)
        damage_per_min = round(damage / max(game_duration_min, 1), 0)
        gold_per_min = round(gold / max(game_duration_min, 1), 0)

        team_id = p.get("teamId", 100)
        team = "Blue" if team_id == 100 else "Red"
        t_obj = team_obj.get(team_id, {})
        t_totals = team_totals.get(team_id, {"kills": 0, "damage": 0, "gold": 0})

        # Bans for this player's team (padded to 5)
        my_bans = list(team_bans.get(team_id, []))
        while len(my_bans) < 5:
            my_bans.append("")

        participant_id = p.get("participantId")
        challenges = p.get("challenges", {})

        kill_participation = round((kills + assists) / max(t_totals["kills"], 1) * 100, 1)
        damage_share = round(damage / max(t_totals["damage"], 1) * 100, 1)
        gold_share = round(gold / max(t_totals["gold"], 1) * 100, 1)
        damage_per_gold = round(damage / max(gold, 1), 2)
        damage_taken = p.get("totalDamageTaken", 0)
        damage_taken_per_min = round(damage_taken / max(game_duration_min, 1), 0)
        vision_score = p.get("visionScore", 0)
        vision_per_min = round(vision_score / max(game_duration_min, 1), 2)

        player_solo_kills = solo_kills.get(participant_id, 0)
        player_plates = turret_plates.get(participant_id, 0)
        player_lvl6 = level6_timestamps.get(participant_id, "")

        p_intervals = interval_stats.get(participant_id, {})
        cs_at, gold_at, xp_at = [], [], []
        for mins in TIMELINE_INTERVALS:
            snapshot = p_intervals.get(mins, {})
            if snapshot and game_duration_min >= mins:
                cs_at.append(snapshot.get("cs", ""))
                gold_at.append(snapshot.get("gold", ""))
                xp_at.append(snapshot.get("xp", ""))
            else:
                cs_at.append("")
                gold_at.append("")
                xp_at.append("")

        first_turret_killed = challenges.get("firstTurretKilled")
        first_turret_killed_assist = challenges.get("firstTurretKilledAssist")

        summoner_name = p.get("riotIdGameName", p.get("summonerName", "Unknown"))
        tag = p.get("riotIdTagline", "")
        fpl_team_name = team_map.get(f"{summoner_name}#{tag}", "")

        row = {
            "game_date": game_date,
            "match_id": match_id,
            "game_duration_min": game_duration_min,
            "team_side": team,
            "team_name": fpl_team_name,  # from --team-map when provided; else "" (see load_team_map)
            "summoner_name": summoner_name,
            "tag": tag,
            "champion": p.get("championName", "Unknown"),
            "role": p.get("teamPosition", "Unknown"),
            "champion_level": p.get("champLevel", 0),
            "kills": kills,
            "deaths": deaths,
            "assists": assists,
            "kda": kda,
            "solo_kills": player_solo_kills,
            "kill_participation_pct": kill_participation,
            "double_kills": p.get("doubleKills", 0),
            "triple_kills": p.get("tripleKills", 0),
            "quadra_kills": p.get("quadraKills", 0),
            "penta_kills": p.get("pentaKills", 0),
            "largest_multi_kill": p.get("largestMultiKill", 0),
            "largest_killing_spree": p.get("largestKillingSpree", 0),
            "first_blood_kill": bool(p.get("firstBloodKill")),
            "first_blood_assist": bool(p.get("firstBloodAssist")),
            "total_damage_to_champions": damage,
            "damage_per_min": int(damage_per_min),
            "damage_share_pct": damage_share,
            "physical_damage": p.get("physicalDamageDealtToChampions", 0),
            "magic_damage": p.get("magicDamageDealtToChampions", 0),
            "true_damage": p.get("trueDamageDealtToChampions", 0),
            "largest_critical_strike": p.get("largestCriticalStrike", 0),
            "damage_per_gold": damage_per_gold,
            "damage_taken": damage_taken,
            "damage_taken_per_min": int(damage_taken_per_min),
            "damage_mitigated": p.get("damageSelfMitigated", 0),
            "total_healing": p.get("totalHeal", 0),
            "healing_on_teammates": p.get("totalHealsOnTeammates", 0),
            "shielding_on_teammates": p.get("totalDamageShieldedOnTeammates", 0),
            "time_ccing_others_s": p.get("timeCCingOthers", 0),
            "total_cc_dealt_s": p.get("totalTimeCCDealt", 0),
            "gold_earned": gold,
            "gold_per_min": int(gold_per_min),
            "gold_share_pct": gold_share,
            "gold_spent": p.get("goldSpent", 0),
            "consumables_purchased": p.get("consumablesPurchased", 0),
            "items_purchased": p.get("itemsPurchased", 0),
            "cs": cs,
            "cs_per_min": cs_per_min,
            "lane_minions_killed": lane_cs,
            "neutral_minions_killed": jungle_cs,
            "cs_at_5": cs_at[0],
            "cs_at_10": cs_at[1],
            "cs_at_15": cs_at[2],
            "cs_at_20": cs_at[3],
            "gold_at_5": gold_at[0],
            "gold_at_10": gold_at[1],
            "gold_at_15": gold_at[2],
            "gold_at_20": gold_at[3],
            "xp_at_5": xp_at[0],
            "xp_at_10": xp_at[1],
            "xp_at_15": xp_at[2],
            "xp_at_20": xp_at[3],
            "turret_plates_destroyed": player_plates,
            "level_6_timing_min": player_lvl6,
            "vision_score": vision_score,
            "vision_score_per_min": vision_per_min,
            "wards_placed": p.get("wardsPlaced", 0),
            "wards_killed": p.get("wardsKilled", 0),
            "control_wards_bought": p.get("visionWardsBoughtInGame", 0),
            "detector_wards_placed": p.get("detectorWardsPlaced", 0),
            "stealth_wards_placed": p.get("sightWardsBoughtInGame", 0),
            "turret_kills": p.get("turretKills", 0),
            "turret_damage": p.get("damageDealtToTurrets", 0),
            "objective_damage": p.get("damageDealtToObjectives", 0),
            "inhibitor_kills": p.get("inhibitorKills", 0),
            "nexus_kills": p.get("nexusKills", 0),
            "objectives_stolen": p.get("objectivesStolen", 0),
            "objectives_stolen_assists": p.get("objectivesStolenAssists", 0),
            "baron_kills": p.get("baronKills", 0),
            "dragon_kills": p.get("dragonKills", 0),
            "spell1_casts_q": p.get("spell1Casts", 0),
            "spell2_casts_w": p.get("spell2Casts", 0),
            "spell3_casts_e": p.get("spell3Casts", 0),
            "spell4_casts_r": p.get("spell4Casts", 0),
            "summoner1_casts": p.get("summoner1Casts", 0),
            "summoner2_casts": p.get("summoner2Casts", 0),
            "longest_time_alive_s": p.get("longestTimeSpentLiving", 0),
            "total_time_dead_s": p.get("totalTimeSpentDead", 0),
            "lane_minions_first_10_min": challenges.get("laneMinionsFirst10Minutes", ""),
            "jungle_cs_before_10_min": challenges.get("jungleCsBefore10Minutes", ""),
            "max_cs_advantage_on_lane_opponent": challenges.get("maxCsAdvantageOnLaneOpponent", ""),
            "max_level_lead_on_lane_opponent": challenges.get("maxLevelLeadLaneOpponent", ""),
            "skillshots_hit": challenges.get("skillshotsHit", ""),
            "skillshots_dodged": challenges.get("skillshotsDodged", ""),
            "damage_per_minute_challenges": challenges.get("damagePerMinute", ""),
            "team_damage_pct": challenges.get("teamDamagePercentage", ""),
            "kda_challenges": challenges.get("kda", ""),
            "kill_participation_challenges": challenges.get("killParticipation", ""),
            "effective_heal_and_shield": challenges.get("effectiveHealAndShielding", ""),
            "bounty_gold": challenges.get("bountyGold", ""),
            "vision_score_advantage_over_lane_opponent": challenges.get("visionScoreAdvantageLaneOpponent", ""),
            "control_wards_placed_challenges": challenges.get("controlWardsPlaced", ""),
            "wards_guarded": challenges.get("wardsGuarded", ""),
            "first_turret_killed": None if first_turret_killed is None else bool(first_turret_killed),
            "first_turret_killed_assist": None if first_turret_killed_assist is None else bool(first_turret_killed_assist),
            "turret_plates_taken_challenges": challenges.get("turretPlatesTaken", ""),
            "solo_turrets_late_game": challenges.get("soloTurretsLategame", ""),
            "turret_takedowns": challenges.get("turretTakedowns", ""),
            "game_ended_in_surrender": bool(p.get("gameEndedInSurrender")),
            "game_ended_in_early_surrender": bool(p.get("gameEndedInEarlySurrender")),
            "all_in_pings": p.get("allInPings", 0),
            "assist_me_pings": p.get("assistMePings", 0),
            "danger_pings": p.get("dangerPings", 0),
            "enemy_missing_pings": p.get("enemyMissingPings", 0),
            "enemy_vision_pings": p.get("enemyVisionPings", 0),
            "on_my_way_pings": p.get("onMyWayPings", 0),
            "push_pings": p.get("pushPings", 0),
            "need_vision_pings": p.get("needVisionPings", 0),
            "team_dragons": t_obj.get("dragons", 0),
            "team_first_dragon": bool(t_obj.get("firstDragon")),
            "team_barons": t_obj.get("barons", 0),
            "team_first_baron": bool(t_obj.get("firstBaron")),
            "team_heralds": t_obj.get("heralds", 0),
            "team_first_herald": bool(t_obj.get("firstHerald")),
            "team_grubs": t_obj.get("grubs", 0),
            "team_first_grubs": bool(t_obj.get("firstGrubs")),
            "team_towers": t_obj.get("towers", 0),
            "team_first_tower": bool(t_obj.get("firstTower")),
            "team_first_blood": bool(t_obj.get("firstBlood")),
            "win": bool(p.get("win")),
            "season": season,
            "season_phase": season_phase,
            "ban_1": my_bans[0],
            "ban_2": my_bans[1],
            "ban_3": my_bans[2],
            "ban_4": my_bans[3],
            "ban_5": my_bans[4],
        }

        # Normalize: blanks ("") -> None, booleans stay real booleans.
        for col in RAW_STATS_COLUMNS:
            if col in BOOLEAN_COLUMNS:
                row[col] = _to_bool_or_none(row[col])
            else:
                row[col] = _blank_to_none(row[col])

        rows.append(row)

    return rows


# ============================================================
# HELPER
# ============================================================


def fetch_and_extract(match_id, match_data, riot_api_key, season=None, season_phase=None, team_map=None):
    print("  Fetching timeline data...")
    timeline_data = get_match_timeline(match_id, riot_api_key)
    solo_kills, interval_stats, turret_plates, first_blood_info, level6_timestamps = parse_timeline_data(
        timeline_data
    )

    total_solos = sum(solo_kills.values())
    total_plates = sum(turret_plates.values())
    print(f"  Timeline: {total_solos} solo kill(s), {total_plates} plate(s) destroyed")

    team_bans = get_team_bans(match_data)
    for tid, bans in team_bans.items():
        side = "Blue" if tid == 100 else "Red"
        ban_list = [b for b in bans if b]
        if ban_list:
            print(f"  {side} bans: {', '.join(ban_list)}")

    stats = extract_stats(
        match_data,
        solo_kills=solo_kills,
        interval_stats=interval_stats,
        turret_plates=turret_plates,
        first_blood_info=first_blood_info,
        level6_timestamps=level6_timestamps,
        season=season,
        season_phase=season_phase,
        team_map=team_map,
    )
    return stats


# ============================================================
# SUPABASE WRITER
# ============================================================


def chunk(items, size):
    return [items[i : i + size] for i in range(0, len(items), size)]


def write_to_supabase(rows, supabase_url, service_key):
    """POST rows to {SUPABASE_URL}/rest/v1/raw_stats in batches of
    WRITE_BATCH_SIZE, with on-conflict-ignore on (match_id, summoner_name).

    Returns True if every batch succeeded (a batch that merely skipped
    already-present duplicate rows still counts as success), False if any
    batch's HTTP request failed (non-2xx status or a request-level
    exception such as a connection error) -- matches scripts/load-stats.ts's
    loud-failure precedent rather than silently continuing on error."""
    if not rows:
        print("  No data to write.")
        return True

    url = f"{supabase_url.rstrip('/')}{RAW_STATS_ENDPOINT}?on_conflict=match_id,summoner_name"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=representation",
    }

    batches = chunk(rows, WRITE_BATCH_SIZE)
    inserted_total = 0
    failed_batches = []
    for i, batch in enumerate(batches, 1):
        try:
            resp = requests.post(url, headers=headers, data=json.dumps(batch))
        except requests.RequestException as exc:
            print(f"  [ERROR] Batch {i}/{len(batches)} failed: request error: {exc}")
            failed_batches.append(i)
            continue
        if resp.status_code not in (200, 201):
            print(f"  [ERROR] Batch {i}/{len(batches)} failed: {resp.status_code} {resp.text}")
            failed_batches.append(i)
            continue
        inserted = resp.json()
        inserted_count = len(inserted) if isinstance(inserted, list) else 0
        skipped = len(batch) - inserted_count
        inserted_total += inserted_count
        print(f"  Batch {i}/{len(batches)}: {inserted_count} inserted, {skipped} skipped (already present).")

    print(f"  Done. Inserted {inserted_total} of {len(rows)} total rows.")

    if failed_batches:
        print(
            f"  [ERROR] {len(failed_batches)}/{len(batches)} batch(es) failed to write: "
            f"batch(es) {', '.join(str(n) for n in failed_batches)}. Re-run the ingester to retry "
            f"(on-conflict-ignore makes re-running safe for rows that already landed)."
        )
        return False

    return True


# ============================================================
# CLI / MAIN
# ============================================================


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Fetch Riot match stats and write them to Supabase's public.raw_stats table."
    )
    parser.add_argument(
        "match_ids",
        nargs="*",
        help="Explicit Riot match ids to fetch (e.g. NA1_5558429844). Mutually exclusive with --dates.",
    )
    parser.add_argument(
        "--dates",
        nargs="+",
        metavar="YYYY-MM-DD",
        help="One or more game-night dates. Discovers match ids via PLAYER_RIOT_IDS' match history "
        "and keeps games in the custom-queue window(s) built from these dates.",
    )
    parser.add_argument("--season", help="Season value to fill in every row's `season` column (e.g. S5).")
    parser.add_argument(
        "--phase", help="Season phase value to fill in every row's `season_phase` column (e.g. Regular)."
    )
    parser.add_argument(
        "--team-map",
        metavar="path.json",
        help="OPTIONAL path to a JSON file mapping \"SummonerName#TAG\": \"FPL Team\" -- fills in each "
        "row's team_name column when the participant's Riot ID matches a key. Without this, team_name "
        "is left blank (see README's Stats ingestion section for the backfill options).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and map rows but do not write to Supabase; prints the first mapped row + row count.",
    )
    return parser


def main(argv=None):
    global CHAMPION_ID_MAP

    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.match_ids and args.dates:
        print("[ERROR] Pass either explicit match ids or --dates, not both.")
        return 1

    if not args.dry_run and not (args.season and args.phase):
        print("[ERROR] --season and --phase are required unless --dry-run is set.")
        print("        Example: --season S5 --phase Regular")
        return 1

    required_names = ["RIOT_API_KEY"] if args.dry_run else REQUIRED_ENV_VARS
    env = require_env(required_names)
    if env is None:
        return 1
    riot_api_key = env["RIOT_API_KEY"]
    supabase_url = env.get("SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")

    try:
        team_map = load_team_map(args.team_map)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"[ERROR] Could not load --team-map file {args.team_map!r}: {exc}")
        return 1
    if team_map:
        print(f"Loaded --team-map with {len(team_map)} player(s).")
    print()

    print("Loading champion ID mappings from Data Dragon...")
    CHAMPION_ID_MAP = fetch_champion_id_map()
    print()

    all_rows = []

    if args.match_ids:
        match_ids = args.match_ids
        print(f"MATCH ID LOOKUP MODE -- Fetching {len(match_ids)} match(es) directly")
        print("=" * 60 + "\n")

        for i, match_id in enumerate(match_ids, 1):
            print(f"[{i}/{len(match_ids)}] Fetching: {match_id}")
            match_data = get_match_details(match_id, riot_api_key)
            time.sleep(API_DELAY)
            if not match_data:
                continue

            info = match_data.get("info", {})
            duration = round(info.get("gameDuration", 0) / 60, 1)
            tz = timezone(timedelta(hours=GAME_TIMEZONE_OFFSET))
            game_start_ts = info.get("gameStartTimestamp", 0) / 1000
            game_date = datetime.fromtimestamp(game_start_ts, tz=tz).strftime("%Y-%m-%d %I:%M %p")
            players = len(info.get("participants", []))
            print(f"  Date: {game_date} | Duration: {duration}m | Players: {players}")

            stats = fetch_and_extract(
                match_id, match_data, riot_api_key, season=args.season, season_phase=args.phase, team_map=team_map
            )
            all_rows.extend(stats)
            print(f"  Extracted {len(stats)} player rows\n")

    else:
        if not PLAYER_RIOT_IDS:
            print("[ERROR] No player Riot IDs configured!")
            return 1

        windows = get_game_time_windows(GAME_DAY, target_dates=args.dates)
        earliest_timestamp = windows[0][0]
        all_match_ids = set()

        for i, riot_id in enumerate(PLAYER_RIOT_IDS, 1):
            print(f"[{i}/{len(PLAYER_RIOT_IDS)}] Looking up: {riot_id}")
            puuid = get_puuid_from_riot_id(riot_id, riot_api_key)
            time.sleep(API_DELAY)
            if not puuid:
                continue
            match_ids = get_all_match_ids(puuid, earliest_timestamp, riot_api_key)
            if match_ids:
                new_ids = set(match_ids) - all_match_ids
                all_match_ids.update(match_ids)
                print(f"  {len(new_ids)} new unique matches")
            print()

        custom_count = 0
        for i, match_id in enumerate(sorted(all_match_ids), 1):
            print(f"[{i}/{len(all_match_ids)}] Fetching: {match_id}")
            match_data = get_match_details(match_id, riot_api_key)
            time.sleep(API_DELAY)
            if not match_data:
                continue
            if is_inhouse_game(match_data, windows):
                custom_count += 1
                stats = fetch_and_extract(
                    match_id,
                    match_data,
                    riot_api_key,
                    season=args.season,
                    season_phase=args.phase,
                    team_map=team_map,
                )
                all_rows.extend(stats)
                print(f"  Inhouse game! {len(stats)} players")

        print(f"\nInhouse games found: {custom_count}")

    print(f"Total rows: {len(all_rows)}")

    if args.dry_run:
        print("\n[DRY RUN] Not writing to Supabase.")
        if all_rows:
            print(f"First mapped row ({len(all_rows[0])} columns):")
            print(json.dumps(all_rows[0], indent=2, default=str))
        print(f"\nRow count: {len(all_rows)}")
        return 0

    if all_rows:
        print("\nWriting to Supabase...")
        write_ok = write_to_supabase(all_rows, supabase_url, service_key)
        if not write_ok:
            return 1

        null_team_rows = [r for r in all_rows if not r.get("team_name")]
        if null_team_rows:
            missing = sorted({f"{r['summoner_name']}#{r['tag']}" for r in null_team_rows})
            print()
            print("=" * 60)
            print(
                f"[WARN] {len(null_team_rows)} row(s) were written with a null/blank team_name "
                f"({len(missing)} distinct player(s)): {', '.join(missing)}"
            )
            print(
                "       The Teams tab excludes null-team rows from standings and the Timeline tab "
                "shows 'Unknown' for them. Re-run with --team-map to fill team_name going forward, "
                "or backfill these rows now -- see README's Stats ingestion section for a concrete "
                "UPDATE statement."
            )
            print("=" * 60)
    else:
        print("No rows to write.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
