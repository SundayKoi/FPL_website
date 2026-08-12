"""
Tests for scripts/riot_stats_ingest.py's mapper (extract_stats and helpers).

Runnable two ways:
    python scripts/test_riot_stats_ingest.py     (plain stdlib asserts, no deps)
    python -m pytest scripts/ -q                 (if pytest is installed)

No network calls -- builds a synthetic match_data dict (2 participants) plus
synthetic timeline outputs and runs them through the real mapper.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json
import tempfile

from riot_stats_ingest import (  # noqa: E402
    RAW_STATS_COLUMNS,
    BOOLEAN_COLUMNS,
    extract_stats,
    load_team_map,
    _to_bool_or_none,
    _blank_to_none,
)

MIGRATION_PATH = os.path.normpath(
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..",
        "supabase",
        "migrations",
        "20260810100001_raw_stats.sql",
    )
)


def migration_columns():
    """Parse the authoritative column list straight out of the
    `create table ... public.raw_stats (...)` migration SQL, independent
    of anything defined in riot_stats_ingest.py -- so this is a real
    cross-check against the source of truth, not the module comparing
    itself to itself."""
    with open(MIGRATION_PATH, "r", encoding="utf-8") as f:
        sql = f.read()
    match = re.search(
        r"create table if not exists public\.raw_stats\s*\((.*?)\n\);", sql, re.S
    )
    if not match:
        raise AssertionError(f"Could not find raw_stats CREATE TABLE body in {MIGRATION_PATH}")
    body = match.group(1)
    columns = []
    for line in body.splitlines():
        line = line.strip().rstrip(",")
        if not line:
            continue
        name = line.split()[0]
        columns.append(name)
    return columns


# ============================================================
# SYNTHETIC FIXTURE
# ============================================================


def make_synthetic_match_data():
    """A minimal but structurally-real match_data dict with 2 participants
    (one per team), enough to exercise every field extract_stats() reads."""
    return {
        "metadata": {"matchId": "NA1_9999999999"},
        "info": {
            "gameDuration": 1800,  # 30 minutes
            "gameStartTimestamp": 1755000000000,  # ms epoch, arbitrary
            "queueId": 3130,
            "gameType": "CUSTOM_GAME",
            "teams": [
                {
                    "teamId": 100,
                    "bans": [
                        {"championId": 1, "pickTurn": 1},
                        {"championId": 2, "pickTurn": 2},
                    ],
                    "objectives": {
                        "dragon": {"kills": 2, "first": True},
                        "baron": {"kills": 1, "first": True},
                        "riftHerald": {"kills": 1, "first": False},
                        "horde": {"kills": 3, "first": True},
                        "tower": {"kills": 5, "first": True},
                        "inhibitor": {"kills": 1, "first": True},
                        "atakhan": {"kills": 0},
                        "champion": {"first": True, "kills": 20},
                    },
                },
                {
                    "teamId": 200,
                    "bans": [],
                    "objectives": {
                        "dragon": {"kills": 0, "first": False},
                        "baron": {"kills": 0, "first": False},
                        "riftHerald": {"kills": 0, "first": False},
                        "horde": {"kills": 0, "first": False},
                        "tower": {"kills": 1, "first": False},
                        "inhibitor": {"kills": 0, "first": False},
                        "atakhan": {"kills": 0},
                        "champion": {"first": False, "kills": 10},
                    },
                },
            ],
            "participants": [
                {
                    "participantId": 1,
                    "teamId": 100,
                    "riotIdGameName": "AfkBoulder",
                    "riotIdTagline": "c9win",
                    "championName": "Ahri",
                    "teamPosition": "MIDDLE",
                    "champLevel": 18,
                    "kills": 10,
                    "deaths": 2,
                    "assists": 8,
                    "totalMinionsKilled": 180,
                    "neutralMinionsKilled": 10,
                    "totalDamageDealtToChampions": 25000,
                    "goldEarned": 15000,
                    "doubleKills": 2,
                    "tripleKills": 1,
                    "quadraKills": 0,
                    "pentaKills": 0,
                    "largestMultiKill": 3,
                    "largestKillingSpree": 5,
                    "firstBloodKill": True,
                    "firstBloodAssist": False,
                    "physicalDamageDealtToChampions": 5000,
                    "magicDamageDealtToChampions": 18000,
                    "trueDamageDealtToChampions": 2000,
                    "largestCriticalStrike": 0,
                    "totalDamageTaken": 20000,
                    "damageSelfMitigated": 8000,
                    "totalHeal": 3000,
                    "totalHealsOnTeammates": 500,
                    "totalDamageShieldedOnTeammates": 100,
                    "timeCCingOthers": 30,
                    "totalTimeCCDealt": 45,
                    "goldSpent": 14500,
                    "consumablesPurchased": 4,
                    "itemsPurchased": 12,
                    "visionScore": 40,
                    "wardsPlaced": 10,
                    "wardsKilled": 3,
                    "visionWardsBoughtInGame": 2,
                    "detectorWardsPlaced": 2,
                    "sightWardsBoughtInGame": 8,
                    "turretKills": 1,
                    "damageDealtToTurrets": 3000,
                    "damageDealtToObjectives": 5000,
                    "inhibitorKills": 0,
                    "nexusKills": 0,
                    "objectivesStolen": 1,
                    "objectivesStolenAssists": 0,
                    "baronKills": 1,
                    "dragonKills": 2,
                    "spell1Casts": 50,
                    "spell2Casts": 40,
                    "spell3Casts": 30,
                    "spell4Casts": 5,
                    "summoner1Casts": 3,
                    "summoner2Casts": 2,
                    "longestTimeSpentLiving": 600,
                    "totalTimeSpentDead": 60,
                    "gameEndedInSurrender": False,
                    "gameEndedInEarlySurrender": False,
                    "allInPings": 1,
                    "assistMePings": 2,
                    "dangerPings": 0,
                    "enemyMissingPings": 3,
                    "enemyVisionPings": 1,
                    "onMyWayPings": 4,
                    "pushPings": 0,
                    "needVisionPings": 1,
                    "win": True,
                    "challenges": {
                        "laneMinionsFirst10Minutes": 60,
                        "jungleCsBefore10Minutes": 5,
                        "maxCsAdvantageOnLaneOpponent": 12.5,
                        "maxLevelLeadLaneOpponent": 1,
                        "skillshotsHit": 20,
                        "skillshotsDodged": 5,
                        "damagePerMinute": 833.3,
                        "teamDamagePercentage": 0.45,
                        "kda": 9.0,
                        "killParticipation": 0.6,
                        "effectiveHealAndShielding": 3600,
                        "bountyGold": 300,
                        "visionScoreAdvantageLaneOpponent": 5.2,
                        "controlWardsPlaced": 2,
                        "wardsGuarded": 1,
                        "firstTurretKilled": 1,
                        "firstTurretKilledAssist": None,
                        "turretPlatesTaken": 2,
                        "soloTurretsLategame": 0,
                        "turretTakedowns": 3,
                    },
                },
                {
                    "participantId": 6,
                    "teamId": 200,
                    "riotIdGameName": "SomeoneElse",
                    "riotIdTagline": "na1",
                    "championName": "Zed",
                    "teamPosition": "MIDDLE",
                    "champLevel": 15,
                    "kills": 3,
                    "deaths": 8,
                    "assists": 4,
                    "totalMinionsKilled": 140,
                    "neutralMinionsKilled": 0,
                    "totalDamageDealtToChampions": 12000,
                    "goldEarned": 9000,
                    "doubleKills": 0,
                    "tripleKills": 0,
                    "quadraKills": 0,
                    "pentaKills": 0,
                    "largestMultiKill": 1,
                    "largestKillingSpree": 1,
                    "firstBloodKill": False,
                    "firstBloodAssist": False,
                    "physicalDamageDealtToChampions": 11000,
                    "magicDamageDealtToChampions": 1000,
                    "trueDamageDealtToChampions": 0,
                    "largestCriticalStrike": 0,
                    "totalDamageTaken": 18000,
                    "damageSelfMitigated": 4000,
                    "totalHeal": 1000,
                    "totalHealsOnTeammates": 0,
                    "totalDamageShieldedOnTeammates": 0,
                    "timeCCingOthers": 5,
                    "totalTimeCCDealt": 10,
                    "goldSpent": 8800,
                    "consumablesPurchased": 1,
                    "itemsPurchased": 9,
                    "visionScore": 15,
                    "wardsPlaced": 4,
                    "wardsKilled": 1,
                    "visionWardsBoughtInGame": 0,
                    "detectorWardsPlaced": 0,
                    "sightWardsBoughtInGame": 4,
                    "turretKills": 0,
                    "damageDealtToTurrets": 500,
                    "damageDealtToObjectives": 500,
                    "inhibitorKills": 0,
                    "nexusKills": 0,
                    "objectivesStolen": 0,
                    "objectivesStolenAssists": 0,
                    "baronKills": 0,
                    "dragonKills": 0,
                    "spell1Casts": 30,
                    "spell2Casts": 25,
                    "spell3Casts": 20,
                    "spell4Casts": 3,
                    "summoner1Casts": 2,
                    "summoner2Casts": 1,
                    "longestTimeSpentLiving": 300,
                    "totalTimeSpentDead": 200,
                    "gameEndedInSurrender": False,
                    "gameEndedInEarlySurrender": False,
                    "allInPings": 0,
                    "assistMePings": 0,
                    "dangerPings": 2,
                    "enemyMissingPings": 0,
                    "enemyVisionPings": 0,
                    "onMyWayPings": 1,
                    "pushPings": 1,
                    "needVisionPings": 0,
                    "win": False,
                    "challenges": {
                        # deliberately sparse -- exercise blank/missing handling
                        "firstTurretKilled": None,
                        "firstTurretKilledAssist": None,
                    },
                },
            ],
        },
    }


def make_synthetic_timeline_outputs():
    """Synthetic (solo_kills, interval_stats, turret_plates, first_blood_info,
    level6_timestamps) tuple, as returned by parse_timeline_data()."""
    solo_kills = {1: 2}
    interval_stats = {
        1: {
            5: {"cs": 40, "gold": 2200, "xp": 2500},
            10: {"cs": 90, "gold": 5200, "xp": 6200},
            15: {"cs": 130, "gold": 8200, "xp": 9800},
            20: {"cs": 170, "gold": 11500, "xp": 13500},
        },
        6: {
            5: {"cs": 35, "gold": 2000, "xp": 2100},
            10: {"cs": 80, "gold": 4800, "xp": 5600},
            # deliberately missing 15/20 -- exercise blank handling
        },
    }
    turret_plates = {1: 3}
    first_blood_info = {"killerId": 1, "timestamp_min": 3.2}
    level6_timestamps = {1: 6.5, 6: 7.1}
    return solo_kills, interval_stats, turret_plates, first_blood_info, level6_timestamps


# ============================================================
# TEST ASSERTIONS
# ============================================================


def run_tests():
    failures = []

    def check(condition, message):
        if not condition:
            failures.append(message)

    match_data = make_synthetic_match_data()
    solo_kills, interval_stats, turret_plates, first_blood_info, level6_timestamps = (
        make_synthetic_timeline_outputs()
    )

    rows = extract_stats(
        match_data,
        solo_kills=solo_kills,
        interval_stats=interval_stats,
        turret_plates=turret_plates,
        first_blood_info=first_blood_info,
        level6_timestamps=level6_timestamps,
        season="S5",
        season_phase="Regular",
    )

    # -- basic shape --
    check(len(rows) == 2, f"expected 2 rows (one per participant), got {len(rows)}")

    row1 = rows[0]  # AfkBoulder, team 100, win
    row2 = rows[1]  # SomeoneElse, team 200, loss

    # -- exact column set: RAW_STATS_COLUMNS (and thus every mapped row) must
    # match the migration's actual column list, parsed independently from
    # the SQL file (not compared against the module's own list -- that
    # would be tautological and wouldn't catch a typo present in both
    # places, e.g. RAW_STATS_COLUMNS and the row dict both saying
    # "assits" instead of "assists"). `id` is excluded: it's the identity
    # primary key, never present in an insert payload.
    mig_cols = set(migration_columns()) - {"id"}
    check(len(mig_cols) == 137, f"expected 137 columns in the migration (excl. id), got {len(mig_cols)}")
    check(
        set(RAW_STATS_COLUMNS) == mig_cols,
        "RAW_STATS_COLUMNS does not exactly match supabase/migrations/20260810100001_raw_stats.sql's "
        f"column list. Only in RAW_STATS_COLUMNS: {sorted(set(RAW_STATS_COLUMNS) - mig_cols)}. "
        f"Only in migration: {sorted(mig_cols - set(RAW_STATS_COLUMNS))}.",
    )
    check(len(RAW_STATS_COLUMNS) == 137, f"expected 137 columns in RAW_STATS_COLUMNS, got {len(RAW_STATS_COLUMNS)}")
    check(set(row1.keys()) == set(RAW_STATS_COLUMNS), "row1 keys do not exactly match RAW_STATS_COLUMNS")
    check(len(row1) == 137, f"expected 137 keys in mapped row, got {len(row1)}")

    # -- kills/deaths/assists land right --
    check(row1["kills"] == 10, f"row1 kills expected 10, got {row1['kills']}")
    check(row1["deaths"] == 2, f"row1 deaths expected 2, got {row1['deaths']}")
    check(row1["assists"] == 8, f"row1 assists expected 8, got {row1['assists']}")
    check(row2["kills"] == 3, f"row2 kills expected 3, got {row2['kills']}")
    check(row2["deaths"] == 8, f"row2 deaths expected 8, got {row2['deaths']}")
    check(row2["assists"] == 4, f"row2 assists expected 4, got {row2['assists']}")

    # -- booleans converted correctly --
    check(row1["win"] is True, f"row1 win expected True, got {row1['win']!r}")
    check(row2["win"] is False, f"row2 win expected False, got {row2['win']!r}")
    check(
        row1["first_blood_kill"] is True,
        f"row1 first_blood_kill expected True, got {row1['first_blood_kill']!r}",
    )
    check(
        row2["first_blood_kill"] is False,
        f"row2 first_blood_kill expected False, got {row2['first_blood_kill']!r}",
    )
    check(isinstance(row1["win"], bool), "row1 win should be a real bool, not a string/int")
    check(isinstance(row1["first_blood_kill"], bool), "row1 first_blood_kill should be a real bool")

    # team-level booleans (challenges.first* on team 100 -> True, team 200 -> False)
    check(row1["team_first_dragon"] is True, "row1 team_first_dragon expected True")
    check(row2["team_first_dragon"] is False, "row2 team_first_dragon expected False")
    check(row1["team_first_blood"] is True, "row1 team_first_blood expected True")
    check(row2["team_first_blood"] is False, "row2 team_first_blood expected False")

    # challenges-derived nullable boolean: participant 1 firstTurretKilled=1 -> True
    check(
        row1["first_turret_killed"] is True,
        f"row1 first_turret_killed expected True, got {row1['first_turret_killed']!r}",
    )
    # participant 6 firstTurretKilled=None -> None (not False)
    check(
        row2["first_turret_killed"] is None,
        f"row2 first_turret_killed expected None, got {row2['first_turret_killed']!r}",
    )
    check(
        row2["first_turret_killed_assist"] is None,
        f"row2 first_turret_killed_assist expected None, got {row2['first_turret_killed_assist']!r}",
    )

    for col in BOOLEAN_COLUMNS:
        check(
            row1[col] in (True, False, None),
            f"boolean column {col!r} did not normalize to True/False/None, got {row1[col]!r}",
        )
        check(
            row2[col] in (True, False, None),
            f"boolean column {col!r} did not normalize to True/False/None (row2), got {row2[col]!r}",
        )

    # -- blanks -> None (row2's challenges dict is sparse) --
    check(
        row2["skillshots_hit"] is None,
        f"row2 skillshots_hit (missing from challenges) expected None, got {row2['skillshots_hit']!r}",
    )
    check(
        row2["bounty_gold"] is None,
        f"row2 bounty_gold (missing from challenges) expected None, got {row2['bounty_gold']!r}",
    )
    # participant 6's interval_stats has no 15/20-minute snapshot -> None
    check(row2["cs_at_15"] is None, f"row2 cs_at_15 expected None (missing snapshot), got {row2['cs_at_15']!r}")
    check(row2["gold_at_20"] is None, f"row2 gold_at_20 expected None (missing snapshot), got {row2['gold_at_20']!r}")

    # sanity: an explicit "" input maps to None via the helper directly
    check(_blank_to_none("") is None, "_blank_to_none('') should return None")
    check(_blank_to_none(None) is None, "_blank_to_none(None) should return None")
    check(_blank_to_none(0) == 0, "_blank_to_none(0) should pass through 0 (falsy but not blank)")

    # -- Yes/No and Win/Loss string conversion via the bool helper --
    check(_to_bool_or_none("Yes") is True, "_to_bool_or_none('Yes') should be True")
    check(_to_bool_or_none("No") is False, "_to_bool_or_none('No') should be False")
    check(_to_bool_or_none("Win") is True, "_to_bool_or_none('Win') should be True")
    check(_to_bool_or_none("Loss") is False, "_to_bool_or_none('Loss') should be False")
    check(_to_bool_or_none("") is None, "_to_bool_or_none('') should be None")
    check(_to_bool_or_none(None) is None, "_to_bool_or_none(None) should be None")
    check(_to_bool_or_none(True) is True, "_to_bool_or_none(True) should stay True")

    # -- bans land in ban_1..ban_5 --
    # team 100 has 2 bans (championId 1, 2) which aren't in the (empty,
    # unfetched) CHAMPION_ID_MAP -- so they resolve to "ChampID_<n>" text,
    # padded to 5 slots with None for the rest.
    check(row1["ban_1"] == "ChampID_1", f"row1 ban_1 expected 'ChampID_1', got {row1['ban_1']!r}")
    check(row1["ban_2"] == "ChampID_2", f"row1 ban_2 expected 'ChampID_2', got {row1['ban_2']!r}")
    check(row1["ban_3"] is None, f"row1 ban_3 expected None (padded blank), got {row1['ban_3']!r}")
    check(row1["ban_4"] is None, f"row1 ban_4 expected None, got {row1['ban_4']!r}")
    check(row1["ban_5"] is None, f"row1 ban_5 expected None, got {row1['ban_5']!r}")
    # team 200 has zero bans -> all 5 slots None
    for col in ("ban_1", "ban_2", "ban_3", "ban_4", "ban_5"):
        check(row2[col] is None, f"row2 {col} expected None (no bans), got {row2[col]!r}")

    # -- season / season_phase args land in the right columns --
    check(row1["season"] == "S5", f"row1 season expected 'S5', got {row1['season']!r}")
    check(row1["season_phase"] == "Regular", f"row1 season_phase expected 'Regular', got {row1['season_phase']!r}")
    check(row2["season"] == "S5", f"row2 season expected 'S5', got {row2['season']!r}")
    check(row2["season_phase"] == "Regular", f"row2 season_phase expected 'Regular', got {row2['season_phase']!r}")

    # -- misc field sanity: match_id, duration, team_side, summoner identity --
    check(row1["match_id"] == "NA1_9999999999", f"row1 match_id wrong: {row1['match_id']!r}")
    check(row1["game_duration_min"] == 30.0, f"row1 game_duration_min expected 30.0, got {row1['game_duration_min']!r}")
    check(row1["team_side"] == "Blue", f"row1 team_side expected 'Blue', got {row1['team_side']!r}")
    check(row2["team_side"] == "Red", f"row2 team_side expected 'Red', got {row2['team_side']!r}")
    check(row1["summoner_name"] == "AfkBoulder", f"row1 summoner_name expected 'AfkBoulder', got {row1['summoner_name']!r}")
    check(row1["tag"] == "c9win", f"row1 tag expected 'c9win', got {row1['tag']!r}")
    check(row1["champion"] == "Ahri", f"row1 champion expected 'Ahri', got {row1['champion']!r}")

    # -- timeline-derived fields (solo kills, plates, level 6, CS/gold/XP@N) --
    check(row1["solo_kills"] == 2, f"row1 solo_kills expected 2, got {row1['solo_kills']!r}")
    check(row1["turret_plates_destroyed"] == 3, f"row1 turret_plates_destroyed expected 3, got {row1['turret_plates_destroyed']!r}")
    check(row1["level_6_timing_min"] == 6.5, f"row1 level_6_timing_min expected 6.5, got {row1['level_6_timing_min']!r}")
    check(row1["cs_at_5"] == 40, f"row1 cs_at_5 expected 40, got {row1['cs_at_5']!r}")
    check(row1["gold_at_10"] == 5200, f"row1 gold_at_10 expected 5200, got {row1['gold_at_10']!r}")
    check(row1["xp_at_20"] == 13500, f"row1 xp_at_20 expected 13500, got {row1['xp_at_20']!r}")

    # -- team_name is blank without a --team-map (default behavior, unchanged) --
    check(row1["team_name"] is None, f"row1 team_name expected None (no team_map), got {row1['team_name']!r}")
    check(row2["team_name"] is None, f"row2 team_name expected None (no team_map), got {row2['team_name']!r}")

    # -- --team-map fills team_name for matched Riot IDs, leaves others blank --
    team_map = {"AfkBoulder#c9win": "Blue Squad"}
    rows_mapped = extract_stats(
        match_data,
        solo_kills=solo_kills,
        interval_stats=interval_stats,
        turret_plates=turret_plates,
        first_blood_info=first_blood_info,
        level6_timestamps=level6_timestamps,
        season="S5",
        season_phase="Regular",
        team_map=team_map,
    )
    mapped_row1, mapped_row2 = rows_mapped
    check(
        mapped_row1["team_name"] == "Blue Squad",
        f"mapped_row1 team_name expected 'Blue Squad' (matched team_map key), got {mapped_row1['team_name']!r}",
    )
    check(
        mapped_row2["team_name"] is None,
        f"mapped_row2 team_name expected None (no team_map match for SomeoneElse#na1), got {mapped_row2['team_name']!r}",
    )

    if failures:
        print(f"FAILED: {len(failures)} assertion(s) failed:")
        for f in failures:
            print(f"  - {f}")
        return False

    print(f"OK: all assertions passed ({len(rows)} synthetic rows mapped, {len(RAW_STATS_COLUMNS)} columns each).")
    return True


def run_team_map_tests():
    """Tests for load_team_map() itself (the --team-map file loader), run
    the same plain-assert way as run_tests()."""
    failures = []

    def check(condition, message):
        if not condition:
            failures.append(message)

    # -- no path (flag omitted) -> {} --
    check(load_team_map(None) == {}, "load_team_map(None) should return {}")
    check(load_team_map("") == {}, "load_team_map('') should return {}")

    # -- valid file loads correctly --
    with tempfile.TemporaryDirectory() as tmpdir:
        valid_path = os.path.join(tmpdir, "team_map.json")
        with open(valid_path, "w", encoding="utf-8") as f:
            json.dump({"AfkBoulder#c9win": "Blue Squad", "DeFaux#ttm": "Red Squad"}, f)
        loaded = load_team_map(valid_path)
        check(
            loaded == {"AfkBoulder#c9win": "Blue Squad", "DeFaux#ttm": "Red Squad"},
            f"load_team_map should load the file's JSON object exactly, got {loaded!r}",
        )

        # -- missing file raises (fail loud, not silent fallback) --
        try:
            load_team_map(os.path.join(tmpdir, "does_not_exist.json"))
            failures.append("load_team_map on a missing file should raise, not return silently")
        except OSError:
            pass

        # -- non-object JSON (e.g. a list) raises --
        list_path = os.path.join(tmpdir, "list.json")
        with open(list_path, "w", encoding="utf-8") as f:
            json.dump(["not", "an", "object"], f)
        try:
            load_team_map(list_path)
            failures.append("load_team_map on a JSON list (not object) should raise")
        except ValueError:
            pass

        # -- invalid JSON raises --
        bad_path = os.path.join(tmpdir, "bad.json")
        with open(bad_path, "w", encoding="utf-8") as f:
            f.write("{not valid json")
        try:
            load_team_map(bad_path)
            failures.append("load_team_map on invalid JSON should raise")
        except json.JSONDecodeError:
            pass

    if failures:
        print(f"FAILED: {len(failures)} team-map assertion(s) failed:")
        for f in failures:
            print(f"  - {f}")
        return False

    print("OK: all load_team_map assertions passed.")
    return True


def run_resolve_season_phase_tests():
    """resolve_season_phase merges explicit flags with the league_settings
    pair: flags win, fetched fills gaps, holes stay None."""
    from riot_stats_ingest import resolve_season_phase

    failures = []
    cases = [
        # (flag_season, flag_phase, fetched, expected)
        ("S5", "Regular", None, ("S5", "Regular")),  # flags alone
        (None, None, ("S6", "Playoffs"), ("S6", "Playoffs")),  # fetched alone
        ("S7", None, ("S6", "Playoffs"), ("S7", "Playoffs")),  # flag overrides season
        (None, "Regular", ("S6", "Playoffs"), ("S6", "Regular")),  # flag overrides phase
        (None, None, None, (None, None)),  # nothing anywhere
        ("S5", None, None, ("S5", None)),  # hole stays None
    ]
    for flag_season, flag_phase, fetched, expected in cases:
        got = resolve_season_phase(flag_season, flag_phase, fetched)
        if got != expected:
            failures.append(
                f"resolve_season_phase({flag_season!r}, {flag_phase!r}, {fetched!r}) = {got!r}, want {expected!r}"
            )

    if failures:
        print(f"FAILED: {len(failures)} resolve_season_phase assertion(s) failed:")
        for f in failures:
            print(f"  - {f}")
        return False

    print("OK: all resolve_season_phase assertions passed.")
    return True


# ============================================================
# pytest entry points (collected automatically if pytest is present)
# ============================================================


def test_mapper_end_to_end():
    assert run_tests() is True


def test_team_map():
    assert run_team_map_tests() is True


def test_resolve_season_phase():
    assert run_resolve_season_phase_tests() is True


# ============================================================
# plain-python entry point
# ============================================================

if __name__ == "__main__":
    ok = run_tests() and run_team_map_tests() and run_resolve_season_phase_tests()
    sys.exit(0 if ok else 1)
