"use client";

import { useState } from "react";
import { createOpenDraftLobbyAction } from "@/lib/match-draft/lobbyActions";
import type { MatchDraftBestOf, OpenDraftLobbyTokens } from "@/lib/match-draft/types";

const BEST_OF_OPTIONS: MatchDraftBestOf[] = [1, 3, 5];

function LobbyLink({ label, hint, token, suffix = "" }: { label: string; hint: string; token: string; suffix?: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/drafter/${token}${suffix}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions/http) — the text is
      // selectable either way.
    }
  };
  return (
    <div className="rounded border border-line bg-navy/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-dash">{label}</span>
        <button type="button" onClick={() => void copy()} className="btn-pill px-3 py-1 text-xs">
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
      <p className="mt-1 break-all font-mono text-xs text-white">{url}</p>
      <p className="mt-1 text-xs text-steel">{hint}</p>
    </div>
  );
}

/** The /drafter landing form: name two teams, pick a format, and get three
 *  secret links (two captain links plus a spectator link) — no account
 *  needed. Creation goes through the create_open_draft_lobby RPC, which
 *  also enforces the site-wide rate cap. */
/** "Faker, Oner, Zeus" (commas or new lines) → up to five trimmed names. */
function parsePlayers(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export default function CreateLobbyForm() {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [playersA, setPlayersA] = useState("");
  const [playersB, setPlayersB] = useState("");
  const [bestOf, setBestOf] = useState<MatchDraftBestOf>(3);
  const [fearless, setFearless] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lobby, setLobby] = useState<(OpenDraftLobbyTokens & { teamA: string; teamB: string }) | null>(null);

  const create = async () => {
    if (!teamA.trim() || !teamB.trim()) {
      setError("Both team names are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // Creation runs through a server action: it re-checks the premium
      // Discord gate and holds the only credentials the create RPC accepts.
      const result = await createOpenDraftLobbyAction({
        teamA: teamA.trim(),
        teamB: teamB.trim(),
        bestOf,
        fearless,
        playersA: parsePlayers(playersA),
        playersB: parsePlayers(playersB),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLobby({ ...result.lobby, teamA: teamA.trim(), teamB: teamB.trim() });
    } catch {
      setError("The lobby could not be created — try again.");
    } finally {
      setCreating(false);
    }
  };

  if (lobby) {
    return (
      <section className="card-brand flex flex-col gap-3 p-5" aria-label="Lobby links">
        <h2 className="type-display text-xl text-white">Lobby ready — share the links</h2>
        <p className="text-sm text-steel">
          Each link is secret: whoever opens a captain link drafts for that team, and anyone with the
          spectator link can watch live. Lobbies expire after 14 days.
        </p>
        <LobbyLink label={`${lobby.teamA} captain`} hint={`Drafts for ${lobby.teamA} (blue side in game 1).`} token={lobby.tokenA} />
        <LobbyLink label={`${lobby.teamB} captain`} hint={`Drafts for ${lobby.teamB} (red side in game 1).`} token={lobby.tokenB} />
        <LobbyLink label="Spectators" hint="Watch-only — share with anyone who wants to follow along." token={lobby.tokenSpectator} />
        <LobbyLink
          label="OBS overlay"
          hint="The spectator view stripped to teams, picks, bans, and the clock — paste into an OBS browser source. Add &bg=transparent to layer it over your own scene."
          token={lobby.tokenSpectator}
          suffix="?overlay=1"
        />
        <div>
          <a href={`/drafter/${lobby.tokenSpectator}`} className="btn-coral inline-block px-4 py-2 text-sm">
            Open the lobby
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="card-brand flex flex-col gap-4 p-5" aria-label="Create a draft lobby">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-steel">
          Team 1 (blue side, game 1)
          <input
            value={teamA}
            onChange={(e) => setTeamA(e.target.value)}
            maxLength={40}
            placeholder="Blue team"
            className="input-brand px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Team 2 (red side, game 1)
          <input
            value={teamB}
            onChange={(e) => setTeamB(e.target.value)}
            maxLength={40}
            placeholder="Red team"
            className="input-brand px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Team 1 players (optional, top → support)
          <input
            value={playersA}
            onChange={(e) => setPlayersA(e.target.value)}
            placeholder="Top, Jungle, Mid, ADC, Support"
            className="input-brand px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Team 2 players (optional, top → support)
          <input
            value={playersB}
            onChange={(e) => setPlayersB(e.target.value)}
            placeholder="Top, Jungle, Mid, ADC, Support"
            className="input-brand px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Series format">
        <span className="label-dash">Format</span>
        {BEST_OF_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={bestOf === option}
            onClick={() => setBestOf(option)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              bestOf === option ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
            }`}
          >
            Bo{option}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={fearless}
          onClick={() => setFearless((current) => !current)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            fearless ? "border border-mint/50 bg-mint/15 text-mint" : "border border-line bg-panel text-steel hover:text-white"
          }`}
        >
          Fearless {fearless ? "on" : "off"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={creating} onClick={() => void create()} className="btn-coral px-5 py-2 text-sm disabled:opacity-40">
          {creating ? "Creating…" : "Create lobby"}
        </button>
        {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      </div>
    </section>
  );
}
