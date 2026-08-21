"use client";

import type { DragEvent } from "react";
import Link from "next/link";
import { ROLE_LABELS_SHORT, type RosterSlotView, type RosterTeamView } from "@/lib/draft/types";
import { linkedAccountLabel, linkedAccountUrls } from "@/lib/players/linkedAccounts";
import { teamSlug } from "@/lib/teams/teamPage";


export type TeamRosterCardProps = {
  team: RosterTeamView;
  league?: "premier" | "academy";
  editable?: boolean;
  onDragStart?: (player: RosterSlotView) => void;
  onDragEnd?: () => void;
  onDragOver?: (player: RosterSlotView) => void;
  onDrop?: (player: RosterSlotView) => void;
  onKeyboardSwap?: (player: RosterSlotView) => void;
};

export default function TeamRosterCard({
  team,
  league = "premier",
  editable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onKeyboardSwap,
}: TeamRosterCardProps) {
  const headingId = `team-heading-${team.id}`;
  const bannerStyle = { backgroundColor: team.bannerColor };

  const handleDragStart = (event: DragEvent<HTMLLIElement>, player: RosterSlotView) => {
    event.dataTransfer?.setData("text/plain", player.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    onDragStart?.(player);
  };

  return (
    // No overflow-hidden on the card: the player account menus open past
    // the bottom edge (the last row's menu was unreachable). The banner and
    // list round their own corners instead.
    <article aria-labelledby={headingId} className="card-brand">
      <div
        aria-label={`${team.name} banner`}
        role="group"
        className={`${team.accentClass} relative flex h-36 items-end justify-between gap-4 overflow-hidden rounded-t-[calc(0.5rem-1px)] px-5 py-5`}
        style={bannerStyle}
      >
        <div className="flex min-w-0 items-end gap-4">
          {team.imageUrl ? (
            // Deployment-specific Supabase Storage hosts make next/image remotePatterns brittle here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.imageUrl}
              alt={`${team.name} logo`}
              className="h-24 w-24 shrink-0 rounded object-contain"
            />
          ) : null}
          <span className="type-display shrink-0 text-5xl text-white/90" aria-hidden="true">
            {team.abbreviation}
          </span>
        </div>
      </div>

      <div className="border-b border-line bg-navy/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="font-display text-2xl font-semibold text-white">
            {/* Placeholder teams (no featured draft) have synthetic ids and
                no page to link to — render them as plain text. */}
            {team.isPlaceholder ? (
              team.name
            ) : (
              <Link
                href={`${league === "academy" ? "/academy/teams" : "/teams"}/${teamSlug(team.name)}`}
                draggable={false}
                className="underline-offset-4 transition hover:text-coral hover:underline"
              >
                {team.name}
              </Link>
            )}
          </h2>
        </div>
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-steel">
          Captain {team.captainName}
        </p>
      </div>

      <ul aria-label={`${team.name} roster`} className="divide-y divide-line/80">
        {team.players.map((player) => {
          const captain = player.acquisition === "captain";
          const freeAgency = player.acquisition === "free_agency";
          const empty = player.isEmpty === true;
          return (
            <li
              key={player.id}
              draggable={editable && !captain && !empty}
              onDragStart={(event) => handleDragStart(event, player)}
              onDragEnd={onDragEnd}
              onDragOver={(event) => {
                if (!editable || captain) return;
                event.preventDefault();
                onDragOver?.(player);
              }}
              onDrop={(event) => {
                if (!editable || captain) return;
                event.preventDefault();
                onDrop?.(player);
              }}
              className={`group flex min-h-12 items-center gap-3 px-4 py-2 last:rounded-b-[calc(0.5rem-1px)] ${
                editable && !captain && !empty ? "cursor-grab hover:bg-white/5" : ""
              }`}
            >
              <span className="w-9 shrink-0 text-xs font-display font-semibold not-italic text-steel">
                {ROLE_LABELS_SHORT[player.role]}
              </span>
              {!empty ? (
                // Click a player for their stats profile or linked OP.GG
                // accounts (from the league's account sheet). Everything
                // inside is draggable={false} so the menu never hijacks the
                // admin editor's row-drag swap gesture — dragging the row
                // still swaps, clicking still opens the menu.
                <details className="group/menu relative min-w-0 flex-1">
                  <summary
                    draggable={false}
                    className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-white underline-offset-4 hover:text-coral hover:underline group-open/menu:text-coral">
                      {player.displayName}
                    </span>
                    <span aria-hidden className="text-[0.55rem] text-steel transition group-open/menu:rotate-180">
                      ▾
                    </span>
                  </summary>
                  <div className="absolute left-0 top-full z-20 mt-1 flex min-w-48 flex-col rounded border border-line bg-navy p-1 shadow-lg">
                    <Link
                      href={`/players/${encodeURIComponent(player.displayName)}`}
                      draggable={false}
                      className="rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:bg-line/40 hover:text-white"
                    >
                      Stats profile
                    </Link>
                    {linkedAccountUrls(player.displayName).map((url, index) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        draggable={false}
                        className="rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:bg-line/40 hover:text-white"
                      >
                        {linkedAccountLabel(url, index)} ↗
                      </a>
                    ))}
                  </div>
                </details>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {player.displayName}
                </span>
              )}
              {captain || freeAgency ? (
                <span
                  aria-label={captain ? "Captain, cannot be traded" : "Free agency"}
                  className="shrink-0 rounded border border-steel/50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-steel"
                >
                  {captain ? "C" : "FA"}
                </span>
              ) : null}
              {editable && !captain && !empty ? (
                <button
                  type="button"
                  onClick={() => onKeyboardSwap?.(player)}
                  className="shrink-0 rounded border border-line px-1.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-steel transition hover:border-coral hover:text-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                  aria-label={`Swap with ${player.displayName}`}
                >
                  Swap with…
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
