#!/usr/bin/env python3
"""Settle fixture-linked betting markets from ingested Riot stats.

This job is deliberately separate from early cash-out. It never calculates a
payout or edits a wallet locally; the database settlement RPC does that under
the market lock. A market is eligible only when its event is Premier/Academy,
its fixture is season-consistent, and its linked raw stats prove a best-of
winner.

The pure ``derive_series_winner`` function is kept small and dependency-free
so the important evidence rules can be tested without a Supabase instance.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from collections import defaultdict
from typing import Any, Mapping, Sequence

import requests


ALLOWED_LEAGUES = {"premier", "academy"}
PAGE_SIZE = 1000
REQUEST_TIMEOUT = 30
SYSTEM_ACTOR = "__stats_settlement__"


class SettlementRequestError(RuntimeError):
    """A common data request failed; the run must exit non-zero."""


def _norm(value: Any) -> str:
    return str(value or "").strip().casefold()


def _jsonable_ids(values: Sequence[Any]) -> list[str]:
    return sorted({str(value) for value in values if value is not None})


def _result(status: str, reason: str | None = None, **fields: Any) -> dict[str, Any]:
    row: dict[str, Any] = {"validation_status": status}
    if reason:
        row["reason"] = reason
    row.update(fields)
    return row


def derive_series_winner(
    fixture: Mapping[str, Any],
    market: Mapping[str, Any],
    reports: Sequence[Mapping[str, Any]],
    raw_stats: Sequence[Mapping[str, Any]],
    league_team_names: Mapping[str, str],
    betting_team_rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Return verified evidence, or a pending/conflict reason.

    ``reports`` are all reports linked to this fixture and each may contain a
    ``match_report_games`` list. ``raw_stats`` contains only rows whose
    ``match_id`` belongs to one of those games. The function counts a match
    once after validating all of its player rows.
    """

    fixture_id = str(fixture.get("id") or "")
    season = fixture.get("season")
    fixture_team_a = str(fixture.get("team_a") or "").strip()
    fixture_team_b = str(fixture.get("team_b") or "").strip()
    best_of = fixture.get("best_of")
    league = str(market.get("league") or "").strip().casefold()
    schedule_season = market.get("schedule_season")

    if league not in ALLOWED_LEAGUES:
        return _result("conflict", "market event is not a Premier or Academy event")
    if not season or schedule_season != season:
        return _result("conflict", "market event season does not match fixture season")
    if not fixture_id or not fixture_team_a or not fixture_team_b:
        return _result("conflict", "fixture is missing id, season, or participants")
    if _norm(fixture_team_a) == _norm(fixture_team_b):
        return _result("conflict", "fixture participants are not distinct")
    if best_of not in (1, 3, 5):
        return _result("conflict", f"fixture has unsupported best_of={best_of!r}")

    non_prop_by_name: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in betting_team_rows:
        if not row.get("is_prop_outcome", False):
            non_prop_by_name[_norm(row.get("name"))].append(row)
    mapped_a = non_prop_by_name.get(_norm(fixture_team_a), [])
    mapped_b = non_prop_by_name.get(_norm(fixture_team_b), [])
    if len(mapped_a) != 1 or len(mapped_b) != 1:
        return _result(
            "conflict",
            "fixture participants do not map to exactly one non-prop betting team",
        )
    betting_a = mapped_a[0]
    betting_b = mapped_b[0]
    market_team_ids = {str(market.get("team_a_id")), str(market.get("team_b_id"))}
    expected_team_ids = {str(betting_a.get("id")), str(betting_b.get("id"))}
    if market_team_ids != expected_team_ids:
        return _result("conflict", "market teams do not match fixture participants")

    if not reports:
        return _result("pending", "fixture has no linked match reports")

    source_report_ids = _jsonable_ids([report.get("id") for report in reports])
    reports_without_games = [report for report in reports if not (report.get("match_report_games") or [])]
    if reports_without_games:
        if len(reports) > 1:
            return _result("conflict", "linked reports include a report with no games")
        if any(report.get("forfeit_team_id") for report in reports_without_games):
            return _result("pending", "forfeit has no verified played games")
        return _result("pending", f"report {reports_without_games[0].get('id')} has no linked games")
    game_ids: list[str] = []
    for report in reports:
        report_season = report.get("season")
        report_a = league_team_names.get(str(report.get("team_a_id")), "")
        report_b = league_team_names.get(str(report.get("team_b_id")), "")
        same_order = _norm(report_a) == _norm(fixture_team_a) and _norm(report_b) == _norm(fixture_team_b)
        reverse_order = _norm(report_a) == _norm(fixture_team_b) and _norm(report_b) == _norm(fixture_team_a)
        if report_season != season or not (same_order or reverse_order):
            return _result(
                "conflict",
                f"report {report.get('id')} disagrees with fixture season or participants",
            )
        for game in report.get("match_report_games") or []:
            match_id = str(game.get("match_id") or "").strip()
            if not match_id:
                return _result("conflict", f"report {report.get('id')} has a blank match id")
            game_ids.append(match_id)

    source_match_ids = _jsonable_ids(game_ids)
    if not source_match_ids:
        if any(report.get("forfeit_team_id") for report in reports):
            return _result("pending", "forfeit has no verified played games")
        return _result("pending", "fixture has no linked match-report games")
    if len(game_ids) != len(source_match_ids):
        return _result("conflict", "linked reports contain duplicate match ids")

    forfeit_ids = {str(report.get("forfeit_team_id")) for report in reports if report.get("forfeit_team_id")}
    if len(forfeit_ids) > 1:
        return _result("conflict", "reports declare different forfeiting teams")
    if forfeit_ids and len(forfeit_ids) != len(reports):
        return _result("conflict", "reports disagree about whether the fixture was forfeited")
    forfeit_id = next(iter(forfeit_ids), None)
    if forfeit_id and forfeit_id not in {
        str(report.get("team_a_id")) for report in reports
    } | {str(report.get("team_b_id")) for report in reports}:
        return _result("conflict", "forfeit team is not a fixture participant")

    stats_by_match: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in raw_stats:
        match_id = str(row.get("match_id") or "").strip()
        if match_id in source_match_ids:
            stats_by_match[match_id].append(row)

    score_a = 0
    score_b = 0
    for match_id in source_match_ids:
        rows = stats_by_match.get(match_id, [])
        if not rows:
            return _result("pending", f"raw stats missing for match {match_id}")
        if any(row.get("season") != season for row in rows):
            return _result("conflict", f"raw stats season mismatch for match {match_id}")
        if any(not str(row.get("team_name") or "").strip() for row in rows):
            return _result("pending", f"raw stats team mapping incomplete for match {match_id}")
        if any(row.get("win") is None for row in rows):
            return _result("pending", f"raw stats winner flag incomplete for match {match_id}")

        expected_names = {_norm(fixture_team_a), _norm(fixture_team_b)}
        actual_names = {_norm(row.get("team_name")) for row in rows}
        if not actual_names <= expected_names:
            return _result("conflict", f"raw stats contain an unexpected team for match {match_id}")
        if not expected_names <= actual_names:
            return _result("pending", f"raw stats contain only one fixture side for match {match_id}")

        team_wins: dict[str, set[bool]] = defaultdict(set)
        for row in rows:
            win = row.get("win")
            if not isinstance(win, bool):
                return _result("conflict", f"raw stats winner flag is not boolean for match {match_id}")
            team_wins[_norm(row.get("team_name"))].add(win)
        if any(len(team_wins[name]) != 1 for name in expected_names):
            return _result("conflict", f"raw stats have conflicting winners for match {match_id}")
        a_won = next(iter(team_wins[_norm(fixture_team_a)]))
        b_won = next(iter(team_wins[_norm(fixture_team_b)]))
        if a_won == b_won:
            return _result("conflict", f"match {match_id} does not have exactly one winning team")
        if a_won:
            score_a += 1
        else:
            score_b += 1

    if len(source_match_ids) > best_of:
        return _result("conflict", f"fixture has {len(source_match_ids)} verified games but best_of is {best_of}")
    threshold = best_of // 2 + 1
    if score_a >= threshold and score_b >= threshold:
        return _result("conflict", "both fixture sides reached the winning threshold")
    if score_a >= threshold:
        winner_name = fixture_team_a
        winner_id = int(betting_a["id"])
    elif score_b >= threshold:
        winner_name = fixture_team_b
        winner_id = int(betting_b["id"])
    else:
        if forfeit_id:
            forfeiting_name = league_team_names.get(forfeit_id, "")
            non_forfeiting_score = score_b if _norm(forfeiting_name) == _norm(fixture_team_a) else score_a
            return _result(
                "pending",
                f"forfeit has only {non_forfeiting_score} verified played wins; needs {threshold}",
            )
        return _result(
            "pending",
            f"incomplete series: verified score {score_a}-{score_b} needs {threshold} wins",
        )

    if forfeit_id:
        forfeiting_name = league_team_names.get(forfeit_id, "")
        if _norm(forfeiting_name) == _norm(winner_name):
            return _result("conflict", "forfeiting team cannot be the verified series winner")
        verified_wins = score_a if winner_name == fixture_team_a else score_b
        if verified_wins < threshold:
            return _result(
                "pending",
                f"forfeit has only {verified_wins} verified played wins; needs {threshold}",
            )

    return _result(
        "ready",
        fixture_id=fixture_id,
        season=season,
        source_report_ids=source_report_ids,
        source_match_ids=source_match_ids,
        series_score={"fixture_team_a": score_a, "fixture_team_b": score_b},
        winner_betting_team_id=winner_id,
        winner_team_name=winner_name,
    )


def _log(kind: str, **fields: Any) -> None:
    print(json.dumps({"event": kind, **fields}, sort_keys=True, default=str))


class SupabaseClient:
    def __init__(self, base_url: str, service_key: str, session: requests.Session | None = None):
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.session = session or requests.Session()

    def _headers(self, extra: Mapping[str, str] | None = None) -> dict[str, str]:
        headers = {"apikey": self.service_key, "Authorization": f"Bearer {self.service_key}"}
        if extra:
            headers.update(extra)
        return headers

    def get(self, table: str, params: Mapping[str, str]) -> list[dict[str, Any]]:
        url = f"{self.base_url}/rest/v1/{table}"
        try:
            response = self.session.get(url, headers=self._headers(), params=dict(params), timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            raise SettlementRequestError(f"GET {table} failed: {exc}") from exc
        if response.status_code != 200:
            raise SettlementRequestError(f"GET {table} failed: HTTP {response.status_code}: {response.text[:300]}")
        try:
            body = response.json()
        except ValueError as exc:
            raise SettlementRequestError(f"GET {table} returned invalid JSON") from exc
        if not isinstance(body, list):
            raise SettlementRequestError(f"GET {table} returned a non-list response")
        return body

    def get_all(self, table: str, params: Mapping[str, str]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            page_params = dict(params)
            page_params.update({"limit": str(PAGE_SIZE), "offset": str(offset)})
            page = self.get(table, page_params)
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                return rows
            offset += PAGE_SIZE

    def rpc(self, function: str, payload: Mapping[str, Any]) -> Any:
        url = f"{self.base_url}/rest/v1/rpc/{function}"
        try:
            response = self.session.post(
                url,
                headers=self._headers({"Content-Type": "application/json"}),
                data=json.dumps(payload),
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise SettlementRequestError(f"RPC {function} failed: {exc}") from exc
        if response.status_code not in (200, 201, 204):
            raise SettlementRequestError(f"RPC {function} failed: HTTP {response.status_code}: {response.text[:300]}")
        if response.status_code == 204 or not response.text.strip():
            return None
        try:
            return response.json()
        except ValueError as exc:
            raise SettlementRequestError(f"RPC {function} returned invalid JSON") from exc


def _load_context(client: SupabaseClient, fixture_filter: str | None, season_filter: str | None) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, str], list[dict[str, Any]], list[dict[str, Any]]]:
    market_params = {
        "select": "id,fixture_id,event_id,team_a_id,team_b_id,status,draw_enabled",
        "status": "in.(OPEN,LOCKED,RESOLVED)",
        "fixture_id": "not.is.null",
        "order": "fixture_id.asc,id.asc",
    }
    if fixture_filter:
        market_params["fixture_id"] = f"eq.{fixture_filter}"
    markets = client.get_all("betting_markets", market_params)
    events = {
        str(row["id"]): row
        for row in client.get_all("betting_events", {"select": "id,league,schedule_season"})
        if row.get("id") is not None
    }
    betting_teams = client.get_all("betting_teams", {"select": "id,name,is_prop_outcome"})
    league_teams = {
        str(row["id"]): str(row.get("name") or "")
        for row in client.get_all("league_teams", {"select": "id,name"})
        if row.get("id") is not None
    }
    fixture_params: dict[str, str] = {"select": "id,season,stage,team_a,team_b,best_of"}
    if season_filter:
        fixture_params["season"] = f"eq.{season_filter}"
    fixtures = client.get_all("fixtures", fixture_params)
    fixture_by_id = {str(row["id"]): row for row in fixtures if row.get("id") is not None}
    if season_filter:
        markets = [market for market in markets if str(market.get("fixture_id")) in fixture_by_id]
    fixture_ids = {str(market["fixture_id"]) for market in markets if market.get("fixture_id")}
    reports = client.get_all(
        "match_reports",
        {
            "select": "id,fixture_id,season,team_a_id,team_b_id,forfeit_team_id,match_report_games(id,match_id,game_number)",
            "fixture_id": "not.is.null",
            "order": "fixture_id.asc,id.asc",
        },
    )
    reports = [report for report in reports if str(report.get("fixture_id")) in fixture_ids]
    return markets, events, fixture_by_id, league_teams, betting_teams, reports


def _raw_stats_for_matches(client: SupabaseClient, match_ids: Sequence[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    unique_ids = sorted(set(match_ids))
    for start in range(0, len(unique_ids), 100):
        chunk = unique_ids[start : start + 100]
        encoded = ",".join(chunk)
        rows.extend(
            client.get_all(
                "raw_stats",
                {
                    "select": "match_id,team_name,win,season,summoner_name",
                    "match_id": f"in.({encoded})",
                },
            )
        )
    return rows


def run_settlement(
    client: SupabaseClient,
    *,
    dry_run: bool = False,
    fixture_filter: str | None = None,
    season_filter: str | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:
    automation_run_id = run_id or str(uuid.uuid4())
    result: dict[str, Any] = {
        "automation_run_id": automation_run_id,
        "dry_run": dry_run,
        "fixture_filter": fixture_filter,
        "season_filter": season_filter,
        "markets": {"settled": [], "already_resolved": [], "pending": [], "conflicts": [], "skipped": [], "failures": []},
        "pickems": {"settled": [], "pending": [], "failures": []},
    }

    markets, events, fixture_by_id, league_teams, betting_teams, reports = _load_context(
        client, fixture_filter, season_filter
    )
    reports_by_fixture: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for report in reports:
        reports_by_fixture[str(report.get("fixture_id"))].append(report)

    all_match_ids = [
        str(game.get("match_id"))
        for report in reports
        for game in report.get("match_report_games") or []
        if game.get("match_id")
    ]
    raw_stats = _raw_stats_for_matches(client, all_match_ids)
    raw_by_match: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in raw_stats:
        raw_by_match[str(row.get("match_id"))].append(row)

    eligible_for_settlement: list[dict[str, Any]] = []
    for market in markets:
        fixture_id = str(market.get("fixture_id"))
        fixture = fixture_by_id.get(fixture_id)
        event = events.get(str(market.get("event_id")))
        market_team_by_id = {str(row.get("id")): row for row in betting_teams}
        if any(
            (market_team_by_id.get(str(market.get(team_id))) or {}).get("is_prop_outcome", False)
            for team_id in ("team_a_id", "team_b_id")
        ):
            item = {"market_id": market.get("id"), "fixture_id": fixture_id, "reason": "prop outcome market"}
            result["markets"]["skipped"].append(item)
            _log("market_skipped", **item)
            continue
        if market.get("draw_enabled"):
            item = {"market_id": market.get("id"), "fixture_id": fixture_id, "reason": "draw-enabled market"}
            result["markets"]["skipped"].append(item)
            _log("market_skipped", **item)
            continue
        if not event or str(event.get("league") or "").casefold() not in ALLOWED_LEAGUES:
            item = {"market_id": market.get("id"), "fixture_id": fixture_id, "reason": "manual or unsupported event"}
            result["markets"]["skipped"].append(item)
            _log("market_skipped", **item)
            continue
        if not fixture or not event:
            result["markets"]["conflicts"].append({"market_id": market.get("id"), "reason": "market fixture or event is missing"})
            _log("validation_conflict", market_id=market.get("id"), reason="market fixture or event is missing")
            continue
        market_with_event = {**market, **event}
        try:
            derived = derive_series_winner(
                fixture,
                market_with_event,
                reports_by_fixture.get(fixture_id, []),
                [row for match_id in {
                    str(game.get("match_id"))
                    for report in reports_by_fixture.get(fixture_id, [])
                    for game in report.get("match_report_games") or []
                    if game.get("match_id")
                } for row in raw_by_match.get(match_id, [])],
                league_teams,
                betting_teams,
            )
        except Exception as exc:  # malformed independent fixture; continue the batch
            item = {"market_id": market.get("id"), "fixture_id": fixture_id, "reason": str(exc)}
            result["markets"]["failures"].append(item)
            _log("settlement_failure", **item)
            continue
        status = derived["validation_status"]
        market_id = market.get("id")
        if status == "ready":
            eligible_for_settlement.append({"market": market, "fixture": fixture, "evidence": derived})
        elif status == "pending":
            item = {"market_id": market_id, "fixture_id": fixture_id, "reason": derived.get("reason")}
            result["markets"]["pending"].append(item)
            _log("pending_fixture", **item)
        else:
            item = {"market_id": market_id, "fixture_id": fixture_id, "reason": derived.get("reason")}
            result["markets"]["conflicts"].append(item)
            _log("validation_conflict", **item)
            # A resolved automated market receives the conflict candidate so
            # the RPC can persist the review flag without reversing payout.
            if market.get("status") == "RESOLVED" and not dry_run:
                try:
                    response = client.rpc(
                        "settle_betting_market_from_stats",
                        {
                            "p_market": market_id,
                            "p_fixture": fixture_id,
                            "p_winning_team": None,
                            "p_evidence": derived,
                            "p_run_id": automation_run_id,
                        },
                    )
                    if isinstance(response, dict) and response.get("status") != "conflict":
                        result["markets"]["failures"].append({"market_id": market_id, "reason": "conflict flag RPC returned an unexpected status"})
                except SettlementRequestError as exc:
                    item = {"market_id": market_id, "fixture_id": fixture_id, "reason": str(exc)}
                    result["markets"]["failures"].append(item)
                    _log("settlement_failure", **item)

    if not dry_run:
        for item in eligible_for_settlement:
            market = item["market"]
            fixture = item["fixture"]
            evidence = item["evidence"]
            payload = {
                "p_market": market["id"],
                "p_fixture": fixture["id"],
                "p_winning_team": int(evidence["winner_betting_team_id"]),
                "p_evidence": evidence,
                "p_run_id": automation_run_id,
            }
            try:
                response = client.rpc("settle_betting_market_from_stats", payload)
                response = response if isinstance(response, dict) else {}
                status = response.get("status")
                if status == "settled":
                    result["markets"]["settled"].append({"market_id": market["id"], "fixture_id": fixture["id"], "evidence": evidence})
                    _log("market_settled", market_id=market["id"], fixture_id=fixture["id"], evidence=evidence)
                elif status == "already_resolved":
                    result["markets"]["already_resolved"].append({"market_id": market["id"], "fixture_id": fixture["id"]})
                    _log("market_already_resolved", market_id=market["id"], fixture_id=fixture["id"])
                elif status in {"pending", "conflict"}:
                    item_result = {"market_id": market["id"], "fixture_id": fixture["id"], "reason": response.get("reason", status)}
                    result["markets"]["pending" if status == "pending" else "conflicts"].append(item_result)
                    _log("pending_fixture" if status == "pending" else "validation_conflict", **item_result)
                else:
                    raise SettlementRequestError(f"RPC returned unexpected status {status!r}")
            except SettlementRequestError as exc:
                item_result = {"market_id": market["id"], "fixture_id": fixture["id"], "reason": str(exc)}
                if "validation conflict" in str(exc):
                    result["markets"]["conflicts"].append(item_result)
                    _log("validation_conflict", **item_result)
                else:
                    result["markets"]["failures"].append(item_result)
                    _log("settlement_failure", **item_result)

    if not dry_run:
        try:
            ready_pickems = client.rpc("resolvable_pickems", {}) or []
            ready_ids = [int(row["id"] if isinstance(row, dict) else row) for row in ready_pickems]
            for pickem_id in ready_ids:
                try:
                    client.rpc("resolve_pickem", {"p_pickem": pickem_id})
                    result["pickems"]["settled"].append(pickem_id)
                    _log("pickem_settled", pickem_id=pickem_id)
                except SettlementRequestError as exc:
                    item = {"pickem_id": pickem_id, "reason": str(exc)}
                    result["pickems"]["failures"].append(item)
                    _log("settlement_failure", **item)
        except SettlementRequestError as exc:
            item = {"reason": str(exc)}
            result["pickems"]["failures"].append(item)
            _log("settlement_failure", **item)

    if dry_run:
        _log("dry_run_complete", automation_run_id=automation_run_id)
    result["summary"] = {
        "markets_settled": len(result["markets"]["settled"]),
        "markets_pending": len(result["markets"]["pending"]),
        "validation_conflicts": len(result["markets"]["conflicts"]),
        "market_failures": len(result["markets"]["failures"]),
        "markets_skipped": len(result["markets"]["skipped"]),
        "pickems_settled": len(result["pickems"]["settled"]),
        "pickem_failures": len(result["pickems"]["failures"]),
    }
    return result


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Settle fixture-linked betting markets from ingested raw_stats.")
    parser.add_argument("--fixture-id", help="Only inspect one fixture UUID.")
    parser.add_argument("--season", help="Only inspect fixtures from this season (for example S5 or A5).")
    parser.add_argument("--dry-run", action="store_true", help="Derive and print settlements without writing markets, wallets, or pick'ems.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    base_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_key:
        print("[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required", file=sys.stderr)
        return 2
    run_id = str(uuid.uuid4())
    try:
        result = run_settlement(
            SupabaseClient(base_url, service_key),
            dry_run=args.dry_run,
            fixture_filter=args.fixture_id,
            season_filter=args.season,
            run_id=run_id,
        )
    except SettlementRequestError as exc:
        _log("settlement_failure", reason=str(exc), automation_run_id=run_id)
        return 2
    print(json.dumps(result, sort_keys=True, indent=2, default=str))
    if result["summary"]["market_failures"] or result["summary"]["pickem_failures"]:
        return 2
    if result["summary"]["validation_conflicts"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
