"""
Tests for scripts/offseason_ingest.py (the temporary offseason tournament
ingest -- delete this file with it once the event is over).

Runnable two ways:
    python scripts/test_offseason_ingest.py
    python -m unittest discover -s scripts -p "test_*.py"

Requires the ingester dependencies: requests and python-dotenv.

No network calls: requests.get/post/patch are replaced by an in-memory fake
PostgREST, and the reused riot_stats_ingest Riot functions are mocked (the
real extract_stats mapper still runs on a synthetic match).
"""

import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests  # noqa: E402

import offseason_ingest as ois  # noqa: E402
import riot_stats_ingest as ris  # noqa: E402

GAME_1 = "11111111-1111-4111-8111-111111111111"
GAME_2 = "22222222-2222-4222-8222-222222222222"
MATCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
WEEK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
TEAM_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
TEAM_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
RIOT_1 = "NA1_5000000001"
RIOT_2 = "NA1_5000000002"

ENV = {
    "RIOT_API_KEY": "RGAPI-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-key",
}

ROSTERS = {
    TEAM_A: ["Alice#NA1", "Ann#NA1"],
    TEAM_B: ["Bob#EUW", "Ben#EUW"],
}


def make_match(riot_match_id=RIOT_1, blue_wins=True):
    """A synthetic Riot match: Team Alpha's players on blue (one spelled in
    a different case than their sign-up, plus a sub on neither roster),
    Team Bravo's on red."""
    blue = [("alice", "na1"), ("Ann", "NA1"), ("Sub", "XX1")]
    red = [("Bob", "EUW"), ("Ben", "EUW")]
    participants = []
    for team_id, players, win in ((100, blue, blue_wins), (200, red, not blue_wins)):
        for name, tag in players:
            participants.append({
                "participantId": len(participants) + 1,
                "teamId": team_id,
                "riotIdGameName": name,
                "riotIdTagline": tag,
                "win": win,
                "kills": 1,
                "totalDamageDealtToChampions": 1000,
                "goldEarned": 5000,
            })
    return {
        "metadata": {"matchId": riot_match_id},
        "info": {"gameDuration": 1800, "gameStartTimestamp": 1790000000000, "teams": [], "participants": participants},
    }


def row(side, team_name, win=False, name="P", tag="T"):
    return {"team_side": side, "team_name": team_name, "win": win, "summoner_name": name, "tag": tag}


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload
        self.text = json.dumps(payload) if payload is not None else ""

    def json(self):
        if self._payload is None:
            raise ValueError("no body")
        return self._payload


class FakePostgrest:
    """Just enough PostgREST for the ingest: canned reads, recorded writes."""

    def __init__(self, games=None, read_status=200, stats_status=201, rpc_status=204):
        self.games = games if games is not None else [
            {"id": GAME_1, "match_id": MATCH, "game_number": 1, "riot_match_id": RIOT_1},
        ]
        self.read_status = read_status
        self.stats_status = stats_status
        self.rpc_status = rpc_status
        self.gets, self.posts, self.patches = [], [], []

    def get(self, url, headers=None, params=None, **kwargs):
        params = dict(params or {})
        self.gets.append((url, params))
        if self.read_status != 200:
            return FakeResponse(self.read_status, {"message": "boom"})
        if url.endswith(ois.OFFSEASON_GAMES_ENDPOINT):
            wanted = params.get("id", "").removeprefix("eq.")
            return FakeResponse(200, [g for g in self.games if not wanted or g["id"] == wanted])
        if url.endswith(ois.OFFSEASON_MATCHES_ENDPOINT):
            return FakeResponse(200, [{"id": MATCH, "team_a_id": TEAM_A, "team_b_id": TEAM_B, "week_id": WEEK}])
        if url.endswith(ois.OFFSEASON_TEAMS_ENDPOINT):
            return FakeResponse(200, [{"id": TEAM_A, "name": "Team Alpha"}, {"id": TEAM_B, "name": "Team Bravo"}])
        if url.endswith(ois.OFFSEASON_TEAM_MEMBERS_ENDPOINT):
            return FakeResponse(200, [
                {"team_id": team_id, "offseason_entrants": {"riot_id": riot_id}}
                for team_id, riot_ids in ROSTERS.items()
                for riot_id in riot_ids
            ])
        return FakeResponse(404, {"message": f"unexpected GET {url}"})

    def post(self, url, headers=None, data=None, **kwargs):
        self.posts.append((url, dict(headers or {}), json.loads(data)))
        if ois.OFFSEASON_STATS_ENDPOINT + "?" in url:
            return FakeResponse(self.stats_status, None if self.stats_status < 300 else {"message": "bad"})
        if url.endswith(ois.RECORD_INGEST_RPC):
            return FakeResponse(self.rpc_status)
        return FakeResponse(404, {"message": f"unexpected POST {url}"})

    def patch(self, url, **kwargs):
        self.patches.append(url)
        return FakeResponse(500, {"message": "the offseason ingest never PATCHes"})

    def stats_posts(self):
        return [(url, headers, body) for url, headers, body in self.posts if ois.OFFSEASON_STATS_ENDPOINT in url]

    def rpc_bodies(self):
        return [body for url, _, body in self.posts if url.endswith(ois.RECORD_INGEST_RPC)]

    def all_urls(self):
        return [u for u, _ in self.gets] + [u for u, _, _ in self.posts] + self.patches


def fake_fetch_and_extract(match_id, match_data, riot_api_key, season=None, season_phase=None, team_map=None):
    """riot_stats_ingest.fetch_and_extract minus its timeline request."""
    return ris.extract_stats(match_data, season=season, season_phase=season_phase, team_map=team_map)


# ============================================================
# PURE HELPERS
# ============================================================


class BuildTeamMapTests(unittest.TestCase):
    def test_keys_use_each_participants_own_spelling(self):
        team_map = ois.build_team_map(
            [("Alice#NA1", "Team Alpha"), ("Bob#EUW", "Team Bravo")], make_match()
        )
        # extract_stats looks up f"{riotIdGameName}#{riotIdTagline}" exactly.
        self.assertEqual(team_map["alice#na1"], "Team Alpha")
        self.assertEqual(team_map["Alice#NA1"], "Team Alpha")
        self.assertEqual(team_map["Bob#EUW"], "Team Bravo")
        self.assertNotIn("Sub#XX1", team_map)

    def test_roster_only_without_match_data(self):
        team_map = ois.build_team_map([("Sunset Diner#na1", "Team Alpha"), ("NoTagHere", "Team Alpha")])
        self.assertEqual(team_map, {"Sunset Diner#na1": "Team Alpha"})

    def test_player_rostered_on_both_teams_names_neither(self):
        team_map = ois.build_team_map(
            [("Alice#NA1", "Team Alpha"), ("alice#na1", "Team Bravo"), ("Ann#NA1", "Team Alpha")], make_match()
        )
        self.assertNotIn("alice#na1", team_map)
        self.assertNotIn("Alice#NA1", team_map)
        self.assertEqual(team_map["Ann#NA1"], "Team Alpha")

    def test_real_mapper_fills_team_name_case_insensitively(self):
        members = [(riot_id, name) for team, name in ((TEAM_A, "Team Alpha"), (TEAM_B, "Team Bravo"))
                   for riot_id in ROSTERS[team]]
        match = make_match()
        rows = ris.extract_stats(match, team_map=ois.build_team_map(members, match))
        names = {r["summoner_name"]: r["team_name"] for r in rows}
        self.assertEqual(names["alice"], "Team Alpha")
        self.assertEqual(names["Ben"], "Team Bravo")
        self.assertIsNone(names["Sub"])


class FillBlankTeamNamesTests(unittest.TestCase):
    def test_blank_takes_the_majority_name_on_its_side(self):
        rows = [
            row("Blue", "Team Alpha"), row("Blue", "Team Alpha"), row("Blue", "Stray"),
            row("Blue", None, name="Sub"), row("Red", "Team Bravo"), row("Red", "", name="Sub2"),
        ]
        filled = ois.fill_blank_team_names(rows)
        self.assertEqual([r["team_name"] for r in rows],
                         ["Team Alpha", "Team Alpha", "Stray", "Team Alpha", "Team Bravo", "Team Bravo"])
        self.assertEqual([r["summoner_name"] for r in filled], ["Sub", "Sub2"])

    def test_side_with_no_names_falls_back_to_blue_or_red(self):
        rows = [row("Blue", None), row("Red", None), row("Red", "")]
        ois.fill_blank_team_names(rows)
        self.assertEqual([r["team_name"] for r in rows], ["Blue", "Red", "Red"])

    def test_nothing_blank_changes_nothing(self):
        rows = [row("Blue", "Team Alpha"), row("Red", "Team Bravo")]
        self.assertEqual(ois.fill_blank_team_names(rows), [])
        self.assertEqual([r["team_name"] for r in rows], ["Team Alpha", "Team Bravo"])


class ResolveWinnerTests(unittest.TestCase):
    TEAMS = {TEAM_A: "Team Alpha", TEAM_B: "Team Bravo"}

    def test_team_named_on_the_winning_rows(self):
        rows = [row("Blue", "team alpha ", win=True), row("Blue", "Team Alpha", win=True), row("Red", "Team Bravo")]
        self.assertEqual(ois.resolve_winner(rows, self.TEAMS), TEAM_A)

    def test_no_winning_rows(self):
        self.assertIsNone(ois.resolve_winner([row("Blue", "Team Alpha"), row("Red", "Team Bravo")], self.TEAMS))

    def test_winning_rows_naming_both_teams(self):
        rows = [row("Blue", "Team Alpha", win=True), row("Blue", "Team Bravo", win=True)]
        self.assertIsNone(ois.resolve_winner(rows, self.TEAMS))

    def test_winning_team_also_on_the_losing_rows(self):
        rows = [row("Blue", "Team Alpha", win=True), row("Red", "Team Alpha")]
        self.assertIsNone(ois.resolve_winner(rows, self.TEAMS))

    def test_unknown_names_and_duplicate_team_names(self):
        self.assertIsNone(ois.resolve_winner([row("Blue", "Blue", win=True)], self.TEAMS))
        rows = [row("Blue", "Same", win=True), row("Red", "Same")]
        self.assertIsNone(ois.resolve_winner(rows, {TEAM_A: "Same", TEAM_B: "same"}))


# ============================================================
# FULL RUNS (main) AGAINST THE FAKE POSTGREST
# ============================================================


class RunTests(unittest.TestCase):
    def run_main(self, argv, fake, match_details=None, env=ENV):
        """main(argv) with every network edge replaced. Returns
        (exit_code, get_match_details mock, fetch_and_extract mock)."""
        get_details = mock.Mock(side_effect=match_details or (lambda match_id, key: make_match(match_id)))
        extract = mock.Mock(side_effect=fake_fetch_and_extract)
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(ris, "_load_env", lambda: None), \
                mock.patch.object(ois.requests, "get", fake.get), \
                mock.patch.object(ois.requests, "post", fake.post), \
                mock.patch.object(ois.requests, "patch", fake.patch), \
                mock.patch.object(ris, "get_match_details", get_details), \
                mock.patch.object(ris, "fetch_and_extract", extract), \
                mock.patch.object(ris, "fetch_champion_id_map", return_value={}), \
                mock.patch.object(ris, "CHAMPION_ID_MAP", {}), \
                mock.patch.object(ois.time, "sleep") as sleep:
            code = ois.main(argv)
        self.sleep = sleep
        return code, get_details, extract

    def assertNeverTouchedRawStats(self, fake):
        self.assertFalse([u for u in fake.all_urls() if "raw_stats" in u], fake.all_urls())
        self.assertEqual(fake.patches, [])

    def test_success_writes_offseason_stats_and_records_the_winner(self):
        fake = FakePostgrest()
        code, get_details, extract = self.run_main([], fake)

        self.assertEqual(code, 0)
        get_details.assert_called_once_with(RIOT_1, ENV["RIOT_API_KEY"])
        self.assertEqual(extract.call_args.kwargs["season"], "OFFSEASON")
        self.assertEqual(extract.call_args.kwargs["season_phase"], "Offseason")
        self.assertTrue(self.sleep.called, "Riot calls must be paced with API_DELAY")

        (url, headers, rows), = fake.stats_posts()
        self.assertEqual(url, ENV["SUPABASE_URL"] + "/rest/v1/offseason_stats?on_conflict=match_id,summoner_name")
        self.assertEqual(headers["Prefer"], "resolution=ignore-duplicates,return=minimal")
        self.assertEqual(headers["Authorization"], "Bearer service-key")
        self.assertEqual(len(rows), 5)
        names = {r["summoner_name"]: r["team_name"] for r in rows}
        self.assertEqual(names, {"alice": "Team Alpha", "Ann": "Team Alpha", "Sub": "Team Alpha",
                                 "Bob": "Team Bravo", "Ben": "Team Bravo"})
        self.assertTrue(all(r["season"] == "OFFSEASON" and r["match_id"] == RIOT_1 for r in rows))

        self.assertEqual(fake.rpc_bodies(), [{"p_game_id": GAME_1, "p_error": None, "p_winner_team_id": TEAM_A}])
        self.assertNeverTouchedRawStats(fake)

    def test_reads_are_batched_with_in_filters(self):
        fake = FakePostgrest(games=[
            {"id": GAME_1, "match_id": MATCH, "game_number": 1, "riot_match_id": RIOT_1},
            {"id": GAME_2, "match_id": MATCH, "game_number": 2, "riot_match_id": RIOT_2},
        ])
        self.run_main([], fake)
        self.assertEqual(len(fake.gets), 4, "one read per table, however many games")
        games_params = fake.gets[0][1]
        self.assertEqual(games_params["riot_match_id"], "not.is.null")
        self.assertEqual(games_params["ingested_at"], "is.null")
        self.assertEqual(fake.gets[1][1]["id"], f"in.({MATCH})")
        self.assertEqual(fake.gets[3][1]["team_id"], f"in.({TEAM_A},{TEAM_B})")

    def test_red_win_is_resolved_to_team_b(self):
        fake = FakePostgrest()
        code, _, _ = self.run_main([], fake, match_details=lambda m, k: make_match(m, blue_wins=False))
        self.assertEqual(code, 0)
        self.assertEqual(fake.rpc_bodies()[0]["p_winner_team_id"], TEAM_B)

    def test_rows_are_written_in_batches(self):
        fake = FakePostgrest()
        with mock.patch.object(ris, "WRITE_BATCH_SIZE", 2):
            code, _, _ = self.run_main([], fake)
        self.assertEqual(code, 0)
        self.assertEqual([len(body) for _, _, body in fake.stats_posts()], [2, 2, 1])

    def test_riot_404_records_the_error_and_moves_on(self):
        fake = FakePostgrest(games=[
            {"id": GAME_1, "match_id": MATCH, "game_number": 1, "riot_match_id": RIOT_1},
            {"id": GAME_2, "match_id": MATCH, "game_number": 2, "riot_match_id": RIOT_2},
        ])
        code, _, _ = self.run_main([], fake, match_details=lambda m, k: None if m == RIOT_1 else make_match(m))

        self.assertEqual(code, 1)
        first, second = fake.rpc_bodies()
        self.assertEqual(first["p_game_id"], GAME_1)
        self.assertIn(RIOT_1, first["p_error"])
        self.assertIsNone(first["p_winner_team_id"])
        self.assertEqual(second, {"p_game_id": GAME_2, "p_error": None, "p_winner_team_id": TEAM_A})
        self.assertEqual({body[0]["match_id"] for _, _, body in fake.stats_posts()}, {RIOT_2})
        self.assertNeverTouchedRawStats(fake)

    def test_network_error_records_the_error(self):
        def boom(match_id, key):
            raise requests.ConnectionError("connection reset")

        fake = FakePostgrest()
        code, _, _ = self.run_main([], fake, match_details=boom)
        self.assertEqual(code, 1)
        (body,) = fake.rpc_bodies()
        self.assertEqual(body["p_game_id"], GAME_1)
        self.assertIn("ConnectionError", body["p_error"])
        self.assertIsNone(body["p_winner_team_id"])
        self.assertEqual(fake.stats_posts(), [])

    def test_stats_write_failure_records_the_error_not_a_winner(self):
        fake = FakePostgrest(stats_status=400)
        code, _, _ = self.run_main([], fake)
        self.assertEqual(code, 1)
        (body,) = fake.rpc_bodies()
        self.assertIn("HTTP 400", body["p_error"])
        self.assertIsNone(body["p_winner_team_id"])

    def test_rpc_failure_fails_the_run(self):
        fake = FakePostgrest(rpc_status=500)
        code, _, _ = self.run_main([], fake)
        self.assertEqual(code, 1)

    def test_dry_run_fetches_but_writes_nothing(self):
        fake = FakePostgrest()
        code, get_details, extract = self.run_main(["--dry-run"], fake)
        self.assertEqual(code, 0)
        get_details.assert_called_once()
        extract.assert_called_once()
        self.assertEqual(fake.posts, [])
        self.assertEqual(fake.patches, [])

    def test_dry_run_with_a_riot_failure_still_writes_nothing(self):
        fake = FakePostgrest()
        code, _, _ = self.run_main(["--dry-run"], fake, match_details=lambda m, k: None)
        self.assertEqual(code, 1)
        self.assertEqual(fake.posts, [])

    def test_game_flag_narrows_the_query(self):
        fake = FakePostgrest(games=[
            {"id": GAME_1, "match_id": MATCH, "game_number": 1, "riot_match_id": RIOT_1},
            {"id": GAME_2, "match_id": MATCH, "game_number": 2, "riot_match_id": RIOT_2},
        ])
        code, get_details, _ = self.run_main(["--game", GAME_2], fake)
        self.assertEqual(code, 0)
        self.assertEqual(fake.gets[0][1]["id"], f"eq.{GAME_2}")
        get_details.assert_called_once_with(RIOT_2, ENV["RIOT_API_KEY"])
        self.assertEqual([b["p_game_id"] for b in fake.rpc_bodies()], [GAME_2])

    def test_game_flag_rejects_a_non_uuid(self):
        with mock.patch("sys.stderr"), self.assertRaises(SystemExit):
            ois.main(["--game", "not-a-uuid"])

    def test_nothing_pending_exits_cleanly_without_calling_riot(self):
        fake = FakePostgrest(games=[])
        code, get_details, _ = self.run_main([], fake)
        self.assertEqual(code, 0)
        get_details.assert_not_called()
        self.assertEqual(fake.posts, [])

    def test_unreadable_queue_fails_the_run(self):
        fake = FakePostgrest(read_status=500)
        code, get_details, _ = self.run_main([], fake)
        self.assertEqual(code, 1)
        get_details.assert_not_called()
        self.assertEqual(fake.posts, [])

    def test_missing_env_fails_before_any_request(self):
        fake = FakePostgrest()
        code, _, _ = self.run_main([], fake, env={"RIOT_API_KEY": "RGAPI-test"})
        self.assertEqual(code, 1)
        self.assertEqual(fake.all_urls(), [])


if __name__ == "__main__":
    unittest.main(buffer=True)
