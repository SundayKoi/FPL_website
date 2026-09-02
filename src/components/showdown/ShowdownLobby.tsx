"use client";

// The lobby: the tables dealing now, and a form to open one.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fmtPoints } from "@/lib/betting/format";
import { createShowdownTableAction } from "@/lib/showdown/actions";
import { BRACKETS, OPENABLE_BRACKETS, PRACTICE_ONLY, SEATS_MAX, type BracketKey } from "@/lib/showdown/config";
import type { fetchOpenTables } from "@/lib/showdown/queries";

type LobbyTable = Awaited<ReturnType<typeof fetchOpenTables>>[number];

export default function ShowdownLobby({ tables, seatedAt, signedIn }: { tables: LobbyTable[]; seatedAt: number | null; signedIn: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bracket, setBracket] = useState<BracketKey>(OPENABLE_BRACKETS[0]);
  const [isPrivate, setPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = () => {
    setError(null);
    start(async () => {
      try {
        const id = await createShowdownTableAction({ name, bracket, private: isPrivate });
        router.push(`/cards/showdown/${id}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not open the table.");
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section aria-label="Tables" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between border-b border-line pb-2">
          <h2 className="type-display text-2xl">Tables</h2>
          {seatedAt !== null ? (
            <Link href={`/cards/showdown/${seatedAt}`} className="text-xs font-semibold text-coral underline-offset-4 hover:underline">
              You have a seat → back to the table
            </Link>
          ) : null}
        </div>
        {tables.length === 0 ? (
          <p className="text-sm text-steel">No table is open. Open one and the first person to sit down with you starts the deal.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tables.map((table) => {
              const b = BRACKETS[table.bracket];
              return (
                <li key={table.id}>
                  <Link
                    href={`/cards/showdown/${table.id}`}
                    className="card-brand flex flex-wrap items-center justify-between gap-3 p-4 transition hover:border-coral"
                  >
                    <span className="flex flex-col">
                      <span className="type-display text-lg text-white">{table.name}</span>
                      <span className="text-xs text-steel">
                        {b.label} · blinds {fmtPoints(b.smallBlind)} / {fmtPoints(b.bigBlind)} · cap {b.stackCap}
                        {b.free ? " · play chips" : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="text-white">
                        {table.seated} / {SEATS_MAX} seated
                      </span>
                      <span className={table.status === "hand" ? "font-semibold text-coral" : "text-steel"}>
                        {table.status === "hand" ? `Hand ${table.handNo} in play` : "Waiting to deal"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Open a table" className="card-brand flex flex-col gap-3 p-5">
        <span className="label-dash">Open a table</span>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="Friday felt"
            className="rounded-md border border-line bg-black/20 px-3 py-2 text-sm text-white"
          />
        </label>
        <fieldset className="flex flex-col gap-1 text-xs text-steel">
          <legend>Stakes</legend>
          {OPENABLE_BRACKETS.map((key) => {
            const b = BRACKETS[key];
            return (
              <label key={key} className="flex items-center gap-2 text-sm text-white">
                <input type="radio" name="bracket" checked={bracket === key} onChange={() => setBracket(key)} />
                {b.free
                  ? `${b.label} · ${fmtPoints(b.smallBlind)} / ${fmtPoints(b.bigBlind)} · ${fmtPoints(b.minBuyIn)} in play chips`
                  : `${b.label} · ${fmtPoints(b.smallBlind)} / ${fmtPoints(b.bigBlind)} · buy-in ${fmtPoints(b.minBuyIn)} to ${fmtPoints(b.maxBuyIn)}`}
              </label>
            );
          })}
          {PRACTICE_ONLY ? (
            <p className="mt-1 text-xs text-steel">
              While Showdown is being tried out, every table is practice: play chips, nothing won or lost, no
              rake. Real stakes come later.
            </p>
          ) : null}
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={isPrivate} onChange={(event) => setPrivate(event.target.checked)} />
          Unlisted — only people with the link find it
        </label>
        {error ? <p className="text-xs text-coral">{error}</p> : null}
        <button
          type="button"
          onClick={open}
          disabled={pending || !signedIn}
          className="btn-pill w-fit px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {pending ? "Opening…" : signedIn ? "Open table" : "Sign in to open a table"}
        </button>
      </section>
    </div>
  );
}
