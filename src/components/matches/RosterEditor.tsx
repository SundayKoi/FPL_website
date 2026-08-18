"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compareSeasonsNewestFirst } from "@/lib/stats/queries";
import type { LeagueTeam, RiotAccount } from "@/lib/matches/types";
import CollapsibleAdminSection, { adminInputClass as inputClass } from "./CollapsibleAdminSection";

/**
 * A `roster_memberships` row with its Riot account embedded via PostgREST
 * (`roster_memberships.select("id, season, league_team_id,
 * riot_accounts(...)")`). Supabase can return a single embedded belongs-to
 * relation as an object or a one-item array depending on relationship
 * inference, so `accountFor` below flattens it the same defensive way
 * src/lib/captain/queries.ts's fetchMyRoster already does for the identical
 * embed.
 */
export interface RosterMembershipRow {
  id: string;
  season: string;
  league_team_id: string;
  riot_accounts: RiotAccount | RiotAccount[] | null;
}

function accountFor(row: RosterMembershipRow): RiotAccount | null {
  const a = row.riot_accounts;
  return Array.isArray(a) ? (a[0] ?? null) : a;
}

/**
 * Splits "Name#TAG" on the LAST '#' (Riot IDs' own tag separator) per
 * task-6-brief.md.
 */
function parseNameTag(raw: string): { gameName: string; tagLine: string } | null {
  const trimmed = raw.trim();
  const idx = trimmed.lastIndexOf("#");
  if (idx <= 0 || idx === trimmed.length - 1) return null;
  const gameName = trimmed.slice(0, idx).trim();
  const tagLine = trimmed.slice(idx + 1).trim();
  return gameName && tagLine ? { gameName, tagLine } : null;
}

/**
 * Case-insensitive match on (game_name, tag_line), mirroring the
 * riot_accounts_key unique index (lower(game_name), lower(tag_line)).
 * Compares the two fields directly rather than joining them into one string
 * key — src/lib/captain/queries.ts's fetchMyResults used a join-key trick
 * for a similar lookup and its own report flagged that as fragile, so this
 * avoids repeating it.
 */
function sameAccount(a: RiotAccount, gameName: string, tagLine: string): boolean {
  return (
    a.game_name.trim().toLowerCase() === gameName.trim().toLowerCase() &&
    a.tag_line.trim().toLowerCase() === tagLine.trim().toLowerCase()
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

/** The red role=alert error / mint success paragraph pair; null otherwise. */
function StatusMessage({ status }: { status: Status }) {
  if (status.kind === "error") {
    return (
      <p role="alert" className="text-sm text-red-400">
        {status.message}
      </p>
    );
  }
  if (status.kind === "success") {
    return <p className="text-sm font-semibold text-mint">{status.message}</p>;
  }
  return null;
}

/**
 * The "sync from draft" admin actions (league teams, Academy teams +
 * captains, captains) with their status lines. The season/team selectors are
 * passed in as children so they share the same wrapping row, but the sync
 * RPCs and their three statuses live here rather than in RosterEditor.
 */
function DraftSyncControls({ season, children }: { season: string; children: ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const [syncTeamsStatus, setSyncTeamsStatus] = useState<Status>({ kind: "idle" });
  const [syncStatus, setSyncStatus] = useState<Status>({ kind: "idle" });
  const [academySyncStatus, setAcademySyncStatus] = useState<Status>({ kind: "idle" });

  const handleSyncTeams = async () => {
    setSyncTeamsStatus({ kind: "saving" });
    const { data, error } = await supabase.rpc("sync_league_teams_from_draft");
    if (error) {
      setSyncTeamsStatus({ kind: "error", message: error.message });
      return;
    }
    const inserted = (data as number | null) ?? 0;
    setSyncTeamsStatus({
      kind: "success",
      message: `Synced ${inserted} team${inserted === 1 ? "" : "s"} from the draft.`,
    });
    router.refresh();
  };

  const handleSyncCaptains = async () => {
    const seasonTrimmed = season.trim();
    if (!seasonTrimmed) {
      setSyncStatus({ kind: "error", message: "Season can't be blank." });
      return;
    }
    setSyncStatus({ kind: "saving" });
    const { data, error } = await supabase.rpc("sync_league_team_captains", { p_season: seasonTrimmed });
    if (error) {
      setSyncStatus({ kind: "error", message: error.message });
      return;
    }
    const inserted = (data as number | null) ?? 0;
    setSyncStatus({
      kind: "success",
      message: `Synced ${inserted} captain${inserted === 1 ? "" : "s"} from the draft for ${seasonTrimmed}.`,
    });
    router.refresh();
  };

  const handleSyncAcademy = async () => {
    setAcademySyncStatus({ kind: "saving" });
    const { data: teamsInserted, error: teamsError } = await supabase.rpc("sync_academy_teams_from_draft");
    if (teamsError) {
      setAcademySyncStatus({ kind: "error", message: teamsError.message });
      return;
    }
    const { data: captainsInserted, error: captainsError } = await supabase.rpc("sync_academy_team_captains", {
      p_season: season.trim(),
    });
    if (captainsError) {
      setAcademySyncStatus({ kind: "error", message: captainsError.message });
      return;
    }
    setAcademySyncStatus({
      kind: "success",
      message: `Synced ${(teamsInserted as number | null) ?? 0} Academy teams and ${(captainsInserted as number | null) ?? 0} captains.`,
    });
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        {children}
        <button
          type="button"
          onClick={() => void handleSyncTeams()}
          disabled={syncTeamsStatus.kind === "saving"}
          className="rounded-full border border-coral px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy disabled:opacity-50"
        >
          {syncTeamsStatus.kind === "saving" ? "Syncing…" : "Sync teams from draft"}
        </button>
        <button
          type="button"
          onClick={() => void handleSyncAcademy()}
          disabled={academySyncStatus.kind === "saving"}
          className="rounded-full border border-steel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral disabled:opacity-50"
        >
          {academySyncStatus.kind === "saving" ? "Syncing…" : "Sync Academy teams"}
        </button>
        <button
          type="button"
          onClick={() => void handleSyncCaptains()}
          disabled={syncStatus.kind === "saving"}
          className="rounded-full border border-coral px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy disabled:opacity-50"
        >
          {syncStatus.kind === "saving" ? "Syncing…" : "Sync captains from draft"}
        </button>
      </div>
      <p className="text-xs text-steel">
        Run teams first, then captains.
      </p>
      <StatusMessage status={syncTeamsStatus} />
      <p className="text-xs text-steel">
        Sync reads the featured draft&apos;s captains and adds a league_team_captains row for each one whose
        team name matches — without this, captains can&apos;t submit reports for their team.
      </p>
      <StatusMessage status={syncStatus} />
      <StatusMessage status={academySyncStatus} />
    </>
  );
}

/**
 * Admin panel on /captain: season + team selector (season defaults to
 * current_season), that team's roster memberships shown as Name#TAG, a
 * single-add box and a bulk-paste box (both "upsert riot_accounts on the
 * lower-cased pair, then the membership" — matched case-insensitively in JS
 * rather than via a literal .upsert(), since the unique index is on
 * lower(game_name)/lower(tag_line) expressions, not the raw columns, so
 * PostgREST's onConflict column-list can't target it directly), a remove
 * button per row, and the "Sync captains from draft" action for
 * sync_league_team_captains. See task-6-brief.md and the coordinator's
 * addendum (Task 4/9 review notes): without this button
 * league_team_captains stays empty and captains can't submit reports for
 * their team (their write RLS is season-scoped to that table).
 */
export default function RosterEditor({
  teams,
  defaultSeason,
  memberships,
}: {
  teams: LeagueTeam[];
  defaultSeason: string;
  memberships: RosterMembershipRow[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [season, setSeason] = useState(defaultSeason);
  const [teamId, setTeamId] = useState(() => teams[0]?.id ?? "");
  const [addText, setAddText] = useState("");
  const [addStatus, setAddStatus] = useState<Status>({ kind: "idle" });
  const [bulkText, setBulkText] = useState("");
  const [bulkStatus, setBulkStatus] = useState<Status>({ kind: "idle" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const knownSeasons = Array.from(new Set([defaultSeason, ...memberships.map((m) => m.season)])).sort(
    compareSeasonsNewestFirst
  );
  const visible = memberships.filter((m) => m.season === season.trim() && m.league_team_id === teamId);
  const activeTeam = teams.find((t) => t.id === teamId) ?? null;

  const handleRemove = async (membershipId: string) => {
    setBusyId(membershipId);
    setRowError(null);
    const { error } = await supabase.from("roster_memberships").delete().eq("id", membershipId);
    setBusyId(null);
    if (error) {
      setRowError(error.message);
      return;
    }
    router.refresh();
  };

  const handleAddOne = async () => {
    const parsed = parseNameTag(addText);
    if (!parsed) {
      setAddStatus({ kind: "error", message: 'Enter a Riot ID like "Name#TAG".' });
      return;
    }
    const seasonTrimmed = season.trim();
    if (!seasonTrimmed) {
      setAddStatus({ kind: "error", message: "Season can't be blank." });
      return;
    }
    setAddStatus({ kind: "saving" });

    const { data: existing, error: fetchError } = await supabase.from("riot_accounts").select("*");
    if (fetchError) {
      setAddStatus({ kind: "error", message: fetchError.message });
      return;
    }
    let account =
      ((existing as RiotAccount[]) ?? []).find((a) => sameAccount(a, parsed.gameName, parsed.tagLine)) ?? null;
    if (!account) {
      const { data: created, error: createError } = await supabase
        .from("riot_accounts")
        .insert({ game_name: parsed.gameName, tag_line: parsed.tagLine })
        .select("*")
        .single();
      if (createError) {
        setAddStatus({ kind: "error", message: createError.message });
        return;
      }
      account = created as RiotAccount;
    }

    const { error: memberError } = await supabase
      .from("roster_memberships")
      .insert({ riot_account_id: account.id, season: seasonTrimmed, league_team_id: teamId });
    if (memberError) {
      setAddStatus({
        kind: "error",
        message:
          memberError.code === "23505"
            ? "This Riot ID is already rostered to a team this season."
            : memberError.message,
      });
      return;
    }

    setAddText("");
    setAddStatus({ kind: "idle" });
    router.refresh();
  };

  const handleBulkAdd = async () => {
    const lines = Array.from(new Set(bulkText.split("\n").map((l) => l.trim()).filter(Boolean)));
    if (lines.length === 0) return;
    const seasonTrimmed = season.trim();
    if (!seasonTrimmed) {
      setBulkStatus({ kind: "error", message: "Season can't be blank." });
      return;
    }
    setBulkStatus({ kind: "saving" });

    const { data: existing, error: fetchError } = await supabase.from("riot_accounts").select("*");
    if (fetchError) {
      setBulkStatus({ kind: "error", message: fetchError.message });
      return;
    }
    // Mutable local snapshot -- appended to as new accounts are created so
    // two lines in the same paste that share a lower-cased pair (or a
    // genuine race with another admin) reuse the same row instead of
    // double-inserting and tripping the unique index.
    const known: RiotAccount[] = [...(((existing as RiotAccount[]) ?? []))];
    const errors: string[] = [];
    let added = 0;

    for (const line of lines) {
      const parsed = parseNameTag(line);
      if (!parsed) {
        errors.push(`"${line}": not a valid Name#TAG`);
        continue;
      }
      let account = known.find((a) => sameAccount(a, parsed.gameName, parsed.tagLine)) ?? null;
      if (!account) {
        const { data: created, error: createError } = await supabase
          .from("riot_accounts")
          .insert({ game_name: parsed.gameName, tag_line: parsed.tagLine })
          .select("*")
          .single();
        if (createError) {
          errors.push(`${parsed.gameName}#${parsed.tagLine}: ${createError.message}`);
          continue;
        }
        account = created as RiotAccount;
        known.push(account);
      }
      const { error: memberError } = await supabase
        .from("roster_memberships")
        .insert({ riot_account_id: account.id, season: seasonTrimmed, league_team_id: teamId });
      if (memberError) {
        errors.push(
          `${parsed.gameName}#${parsed.tagLine}: ${
            memberError.code === "23505" ? "already rostered this season" : memberError.message
          }`
        );
        continue;
      }
      added += 1;
    }

    setBulkStatus(
      errors.length > 0
        ? { kind: "error", message: `Added ${added}. ${errors.length} failed: ${errors.join("; ")}` }
        : { kind: "idle" }
    );
    if (added > 0) {
      setBulkText("");
      router.refresh();
    }
  };

  return (
    <CollapsibleAdminSection title="Admin — rosters">
          <DraftSyncControls season={season}>
            <label className="flex flex-col gap-1 text-xs text-steel">
              Season
              <input
                list="roster-editor-seasons"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className={inputClass}
              />
              <datalist id="roster-editor-seasons">
                {knownSeasons.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-steel">
              Team
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputClass}>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </DraftSyncControls>

          {teams.length === 0 ? (
            <p className="text-sm text-steel">Add a league team first.</p>
          ) : (
            <>
              <div>
                <h3 className="label-dash">
                  {activeTeam?.name ?? "Team"} — {season.trim() || "(no season)"}
                </h3>
                {rowError && (
                  <p role="alert" className="mt-1 text-sm text-red-400">
                    {rowError}
                  </p>
                )}
                {visible.length === 0 ? (
                  <p className="mt-2 text-sm text-steel">No Riot IDs on this roster yet for this season.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {visible.map((m) => {
                      const account = accountFor(m);
                      return (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-center gap-2 rounded border border-line/60 bg-navy/60 px-3 py-1.5 text-sm"
                        >
                          <code className="font-mono text-white">
                            {account ? `${account.game_name}#${account.tag_line}` : "(deleted Riot account)"}
                          </code>
                          {account?.display_name && <span className="text-steel">({account.display_name})</span>}
                          <button
                            type="button"
                            disabled={busyId === m.id}
                            onClick={() => void handleRemove(m.id)}
                            className="ml-auto text-xs font-semibold text-steel hover:text-red-400 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <label className="flex flex-col gap-1 text-xs text-steel">
                  Add Riot ID
                  <input
                    value={addText}
                    onChange={(e) => {
                      setAddText(e.target.value);
                      setAddStatus({ kind: "idle" });
                    }}
                    placeholder="Name#TAG"
                    className={`${inputClass} font-mono`}
                  />
                </label>
                <button
                  type="button"
                  disabled={addStatus.kind === "saving" || !addText.trim()}
                  onClick={() => void handleAddOne()}
                  className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy disabled:opacity-50"
                >
                  {addStatus.kind === "saving" ? "Adding…" : "Add"}
                </button>
              </div>
              <StatusMessage status={addStatus} />

              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <label className="flex flex-col gap-1 text-xs text-steel">
                  Bulk add — one Name#TAG per line
                  <textarea
                    value={bulkText}
                    onChange={(e) => {
                      setBulkText(e.target.value);
                      setBulkStatus({ kind: "idle" });
                    }}
                    rows={4}
                    placeholder={"Faker#KR1\nCanyon#KR1"}
                    className={`${inputClass} font-mono`}
                  />
                </label>
                <button
                  type="button"
                  disabled={bulkStatus.kind === "saving" || !bulkText.trim()}
                  onClick={() => void handleBulkAdd()}
                  className="w-fit rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-white disabled:opacity-50"
                >
                  {bulkStatus.kind === "saving" ? "Adding…" : "Bulk add"}
                </button>
                <StatusMessage status={bulkStatus} />
              </div>
            </>
          )}
    </CollapsibleAdminSection>
  );
}
