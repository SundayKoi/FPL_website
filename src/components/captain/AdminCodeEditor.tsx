"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hasResult, stageMeta, teamLabel } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import type { LeagueTeam } from "@/lib/matches/types";
import type { MatchCode } from "@/lib/captain/queries";
import AdminCodeImporter from "./AdminCodeImporter";

function normalizeName(name: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

/**
 * Resolve a fixture's free-text team name to a league_teams id
 * (case-insensitive, trimmed). Mirrors src/app/captain/page.tsx's private
 * matchTeamId — duplicated locally rather than imported (page.tsx doesn't
 * export it, and this codebase's convention is small per-file helpers, e.g.
 * messageFor in AdminFixturesEditor.tsx / AdminTeamEditor.tsx) rather than a
 * cross-import from a route's page.tsx.
 */
function resolveTeamId(teams: LeagueTeam[], name: string | null): string | null {
  const target = normalizeName(name);
  if (!target) return null;
  return teams.find((t) => normalizeName(t.name) === target)?.id ?? null;
}

function codesTextFor(codes: MatchCode[], fixtureId: string | undefined): string {
  if (!fixtureId) return "";
  return codes
    .filter((c) => c.fixture_id === fixtureId)
    .sort((a, b) => a.game_number - b.game_number)
    .map((c) => c.code)
    .join("\n");
}

function fixtureLabel(fixture: FixtureRow): string {
  return `${stageMeta(fixture.stage).label} — ${teamLabel(fixture.team_a)} vs ${teamLabel(fixture.team_b)}`;
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

/**
 * Admin panel on /captain: pick an open fixture for the current season,
 * paste tourney codes one per line, Save replaces that fixture's whole code
 * set, numbered 1..N in line order. team_a_id/team_b_id are resolved from
 * the fixture's free-text team names against league_teams, refusing to save
 * when a name doesn't resolve. The actual replace (delete existing rows +
 * insert the new set) happens inside the single `replace_match_codes` RPC
 * (see supabase/migrations/20260811100005_replace_match_codes.sql) rather
 * than as two separate client round-trips — a delete-then-insert pair here
 * could leave a fixture with zero codes if the insert failed after the
 * delete succeeded (network blip, closed tab, concurrent admin); the RPC
 * makes that atomic. See docs/superpowers/specs/2026-08-11-captains-page-
 * design.md ("New tables" -> match_codes) and task-6-brief.md.
 */
export default function AdminCodeEditor({
  fixtures,
  teams,
  codes,
}: {
  fixtures: FixtureRow[];
  teams: LeagueTeam[];
  codes: MatchCode[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // "Open fixtures for the current season" per the brief — `fixtures` is
  // already scoped to the current season by src/app/captain/page.tsx.
  const openFixtures = [...fixtures]
    .filter((f) => !hasResult(f))
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "") || a.sort_order - b.sort_order);
  const season = fixtures[0]?.season ?? "";

  const [fixtureId, setFixtureId] = useState(() => openFixtures[0]?.id ?? "");
  const [text, setText] = useState(() => codesTextFor(codes, openFixtures[0]?.id));
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const selectFixture = (id: string) => {
    setFixtureId(id);
    setText(codesTextFor(codes, id));
    setStatus({ kind: "idle" });
  };

  const handleSave = async () => {
    const fixture = fixtures.find((f) => f.id === fixtureId);
    if (!fixture) {
      setStatus({ kind: "error", message: "Pick a fixture first." });
      return;
    }
    const teamAId = resolveTeamId(teams, fixture.team_a);
    const teamBId = resolveTeamId(teams, fixture.team_b);
    if (!teamAId || !teamBId) {
      setStatus({
        kind: "error",
        message: `Could not match both team names to League teams (Team A "${fixture.team_a ?? "TBD"}", Team B "${
          fixture.team_b ?? "TBD"
        }"). Fix the names in League teams below first.`,
      });
      return;
    }

    // Blank/whitespace-only lines are dropped server-side by the RPC itself
    // (see replace_match_codes) -- passed through here unfiltered so the
    // reported count always reflects what actually got inserted.
    const lines = text.split("\n");
    setStatus({ kind: "saving" });

    const { data, error } = await supabase.rpc("replace_match_codes", {
      p_fixture_id: fixture.id,
      p_season: fixture.season,
      p_team_a_id: teamAId,
      p_team_b_id: teamBId,
      p_codes: lines,
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }

    const inserted = (data as number | null) ?? 0;
    setStatus({ kind: "success", message: `Saved ${inserted} code${inserted === 1 ? "" : "s"}.` });
    router.refresh();
  };

  return (
    <div className="card-brand overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="label-dash">Admin — tourney codes</span>
        <span aria-hidden="true" className="text-steel">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
          {openFixtures.length === 0 ? (
            <p className="text-sm text-steel">No open fixtures this season to add codes for.</p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs text-steel">
                Fixture
                <select
                  value={fixtureId}
                  onChange={(e) => selectFixture(e.target.value)}
                  className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none"
                >
                  {openFixtures.map((f) => (
                    <option key={f.id} value={f.id}>
                      {fixtureLabel(f)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-steel">
                Codes, one per line (game 1 first)
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setStatus({ kind: "idle" });
                  }}
                  rows={5}
                  placeholder={"NA1234\nNA5678\nNA9012"}
                  className="rounded border border-line bg-navy px-2 py-1.5 font-mono text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
                />
              </label>
              <p className="text-xs text-steel">
                Saving replaces this fixture&apos;s whole code set — games are numbered 1..N in the order typed
                above.
              </p>
              {status.kind === "error" && (
                <p role="alert" className="text-sm text-red-400">
                  {status.message}
                </p>
              )}
              {status.kind === "success" && (
                <p className="text-sm font-semibold text-emerald-400">{status.message}</p>
              )}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={status.kind === "saving"}
                className="w-fit rounded-full bg-gold px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy disabled:opacity-50"
              >
                {status.kind === "saving" ? "Saving…" : "Save codes"}
              </button>
              <AdminCodeImporter fixtures={fixtures} season={season} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
