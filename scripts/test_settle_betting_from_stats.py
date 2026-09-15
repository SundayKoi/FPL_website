"""Pure tests for settle-betting-from-stats.py.

Run directly with ``python scripts/test_settle_betting_from_stats.py``. No
Supabase or network connection is needed.
"""

from __future__ import annotations

import importlib.util
import pathlib
import unittest


SCRIPT = pathlib.Path(__file__).with_name("settle-betting-from-stats.py")
SPEC = importlib.util.spec_from_file_location("settle_betting_from_stats", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class SettlementDerivationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = {
            "id": "fixture-1",
            "season": "S99",
            "team_a": "Alpha",
            "team_b": "Bravo",
            "best_of": 3,
        }
        self.market = {
            "id": 41,
            "fixture_id": "fixture-1",
            "team_a_id": 11,
            "team_b_id": 12,
            "league": "premier",
            "schedule_season": "S99",
        }
        self.teams = [
            {"id": 11, "name": "Alpha", "is_prop_outcome": False},
            {"id": 12, "name": "Bravo", "is_prop_outcome": False},
        ]
        self.team_names = {"league-alpha": "Alpha", "league-bravo": "Bravo"}
        self.reports = [{
            "id": "report-1",
            "fixture_id": "fixture-1",
            "season": "S99",
            "team_a_id": "league-alpha",
            "team_b_id": "league-bravo",
            "forfeit_team_id": None,
            "match_report_games": [
                {"match_id": "M1", "game_number": 1},
                {"match_id": "M2", "game_number": 2},
                {"match_id": "M3", "game_number": 3},
            ],
        }]

    def stats(self, winners: tuple[str, str, str] = ("Alpha", "Bravo", "Alpha")):
        rows = []
        for index, winner in enumerate(winners, 1):
            match_id = f"M{index}"
            loser = "Bravo" if winner == "Alpha" else "Alpha"
            # Multiple player rows must still count as one verified match.
            rows.extend([
                {"match_id": match_id, "summoner_name": f"winner-{index}", "team_name": winner, "win": True, "season": "S99"},
                {"match_id": match_id, "summoner_name": f"loser-{index}", "team_name": loser, "win": False, "season": "S99"},
            ])
        return rows

    def derive(self, reports=None, raw_stats=None, market=None, fixture=None):
        return MODULE.derive_series_winner(
            fixture or self.fixture,
            market or self.market,
            reports if reports is not None else self.reports,
            raw_stats if raw_stats is not None else self.stats(),
            self.team_names,
            self.teams,
        )

    def test_winner_derivation_counts_unique_matches_not_player_rows(self):
        result = self.derive()
        self.assertEqual(result["validation_status"], "ready")
        self.assertEqual(result["series_score"], {"fixture_team_a": 2, "fixture_team_b": 1})
        self.assertEqual(result["winner_betting_team_id"], 11)

    def test_reversed_team_order_in_report_and_stats_is_safe(self):
        reversed_report = {**self.reports[0], "team_a_id": "league-bravo", "team_b_id": "league-alpha"}
        reversed_stats = []
        for row in self.stats():
            reversed_stats.append({**row, "team_name": row["team_name"].strip()})
        result = self.derive(reports=[reversed_report], raw_stats=reversed_stats)
        self.assertEqual(result["validation_status"], "ready")
        self.assertEqual(result["winner_betting_team_id"], 11)

    def test_incomplete_series_stays_pending(self):
        report = {**self.reports[0], "match_report_games": self.reports[0]["match_report_games"][:2]}
        result = self.derive(reports=[report], raw_stats=self.stats()[:4])
        self.assertEqual(result["validation_status"], "pending")
        self.assertIn("incomplete series", result["reason"])

    def test_conflicting_winner_rows_stay_unresolved(self):
        rows = self.stats()
        rows.append({"match_id": "M1", "summoner_name": "conflict", "team_name": "Alpha", "win": False, "season": "S99"})
        result = self.derive(raw_stats=rows)
        self.assertEqual(result["validation_status"], "conflict")
        self.assertIn("conflicting winners", result["reason"])

    def test_season_isolation_stays_unresolved(self):
        rows = self.stats()
        rows[0] = {**rows[0], "season": "A99"}
        result = self.derive(raw_stats=rows)
        self.assertEqual(result["validation_status"], "conflict")
        self.assertIn("season mismatch", result["reason"])

    def test_conflicting_report_participants_stay_unresolved(self):
        conflicting = {**self.reports[0], "season": "S98"}
        result = self.derive(reports=[self.reports[0], conflicting])
        self.assertEqual(result["validation_status"], "conflict")
        self.assertIn("disagrees", result["reason"])

    def test_forfeit_without_sufficient_played_wins_stays_pending(self):
        report = {**self.reports[0], "forfeit_team_id": "league-bravo", "match_report_games": self.reports[0]["match_report_games"][:1]}
        result = self.derive(reports=[report], raw_stats=self.stats()[:2])
        self.assertEqual(result["validation_status"], "pending")
        self.assertIn("forfeit", result["reason"])

    def test_retry_derivation_is_stable(self):
        first = self.derive()
        second = self.derive()
        self.assertEqual(first, second)
        self.assertEqual(first["source_match_ids"], ["M1", "M2", "M3"])


class ConflictFlagResponseTests(unittest.TestCase):
    """The response the RPC gives when a conflict is flagged on a RESOLVED market.

    A market resolved BY HAND carries no settlement evidence, so the
    automation never settled it and settle_betting_market_from_stats answers
    already_resolved. Reading that as a failure is what made an ordinary week
    exit 2 on 2026-09-15 — and because the card workflows gate on this
    workflow's conclusion, a betting bookkeeping detail silently stopped
    moment cards, the weekly drop and the draw from running at all.
    """

    def test_conflict_is_the_flag_being_recorded(self):
        self.assertIsNone(MODULE.conflict_flag_failure({"status": "conflict", "market_id": 43}))

    def test_already_resolved_is_a_hand_resolved_market_not_a_failure(self):
        self.assertIsNone(MODULE.conflict_flag_failure({"status": "already_resolved", "market_id": 34}))

    def test_a_genuinely_unexpected_status_still_fails_and_names_itself(self):
        reason = MODULE.conflict_flag_failure({"status": "settled", "market_id": 35})
        self.assertIsNotNone(reason)
        self.assertIn("settled", reason)

    def test_a_missing_status_fails_and_says_so(self):
        reason = MODULE.conflict_flag_failure({"market_id": 46})
        self.assertIsNotNone(reason)
        self.assertIn("None", reason)

    def test_a_non_mapping_response_is_not_judged(self):
        # The RPC layer raises on a real transport error. Inventing a failure
        # from a shape we did not expect to parse would be guessing.
        for shape in (None, [], "ok", 200):
            self.assertIsNone(MODULE.conflict_flag_failure(shape))


if __name__ == "__main__":
    unittest.main()
