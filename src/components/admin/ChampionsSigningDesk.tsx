"use client";

// The owner's counter for one-time signing links. Two of the Hand's five
// champions aren't site members, so their real ink has to arrive through
// a bearer link: mint one here, copy it, DM it. Each row shows the ink
// actually on file (not just whether — a stray-dot save looks identical
// to real ink in a boolean), any live link already out, and the reset
// path when a link went wrong: void the link, clear the ink, mint fresh.
//
// Every action here is owner-gated server side too — this component is
// just the counter top.

import { useState } from "react";
import {
  clearChampionInkAction,
  createSignatureInviteAction,
  voidSignatureInviteAction,
} from "@/lib/cards/signing-actions";
import { INVITE_DAYS } from "@/lib/cards/signing";

export interface SigningDeskRow {
  rank: string;
  name: string;
  summoner: string;
  tag: string;
  /** The newest drawn signature on file for this account (any season) —
   *  the exact ink the pack mint would print — or null. */
  ink: string | null;
  /** Latest unused, unexpired invite already minted, if any. */
  invite: { token: string; expiresAt: string } | null;
}

function signUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/sign/${token}`;
}

/** Two-tap guard for the destructive buttons: first tap arms, second
 *  fires, anything else disarms. */
type Armed = { kind: "void" | "clear"; rank: string } | null;

export default function ChampionsSigningDesk({ rows, season }: { rows: SigningDeskRow[]; season: string }) {
  // rank → freshly minted token this visit (newer than the server-fetched
  // invite prop, so it wins the display).
  const [minted, setMinted] = useState<Record<string, string>>({});
  // rank → token voided this visit, so the dead link drops immediately.
  const [voided, setVoided] = useState<Record<string, string>>({});
  // rank whose ink was cleared this visit.
  const [cleared, setCleared] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [armed, setArmed] = useState<Armed>(null);
  const [error, setError] = useState<string | null>(null);

  const mint = async (row: SigningDeskRow) => {
    setBusy(row.rank);
    setArmed(null);
    setError(null);
    const result = await createSignatureInviteAction({
      season,
      summonerName: row.summoner,
      tag: row.tag,
      displayName: row.name,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMinted((prev) => ({ ...prev, [row.rank]: result.token }));
  };

  const voidLink = async (row: SigningDeskRow, token: string) => {
    if (armed?.kind !== "void" || armed.rank !== row.rank) {
      setArmed({ kind: "void", rank: row.rank });
      return;
    }
    setBusy(row.rank);
    setArmed(null);
    setError(null);
    const result = await voidSignatureInviteAction(token);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setVoided((prev) => ({ ...prev, [row.rank]: token }));
  };

  const clearInk = async (row: SigningDeskRow) => {
    if (armed?.kind !== "clear" || armed.rank !== row.rank) {
      setArmed({ kind: "clear", rank: row.rank });
      return;
    }
    setBusy(row.rank);
    setArmed(null);
    setError(null);
    const result = await clearChampionInkAction({ summonerName: row.summoner, tag: row.tag });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCleared((prev) => ({ ...prev, [row.rank]: true }));
  };

  const copy = async (rank: string, token: string) => {
    try {
      await navigator.clipboard.writeText(signUrl(token));
      setCopied(rank);
      setTimeout(() => setCopied((current) => (current === rank ? null : current)), 2000);
    } catch {
      setError("Couldn't reach the clipboard — copy the link from the box instead.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const serverToken = row.invite && row.invite.token !== voided[row.rank] ? row.invite.token : null;
          const token = minted[row.rank] ?? serverToken;
          const ink = cleared[row.rank] ? null : row.ink;
          const isArmed = (kind: "void" | "clear") => armed?.kind === kind && armed.rank === row.rank;
          return (
            <li
              key={row.rank}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-border bg-surface px-4 py-3"
            >
              <span className="w-14 shrink-0 font-mono text-sm text-muted">{row.rank}♠</span>
              <span className="min-w-32 text-sm font-semibold text-white">{row.name}</span>
              {ink ? (
                <span className="flex items-center gap-2">
                  {/* The stored ink itself, on the dark ground it prints on —
                      this is where a stray-dot save is caught by eye. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ink} alt={`${row.name}'s ink on file`} className="h-8 w-24 rounded bg-canvas object-contain px-1" />
                  <button
                    type="button"
                    onClick={() => void clearInk(row)}
                    disabled={busy !== null}
                    className="rounded-full border border-border bg-canvas px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted transition hover:border-red-400 hover:text-red-400 disabled:opacity-40"
                  >
                    {isArmed("clear") ? "Wipe it — sure?" : "Clear ink"}
                  </button>
                </span>
              ) : (
                <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                  No ink
                </span>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {token ? (
                  <>
                    <code className="max-w-56 truncate rounded bg-canvas px-2 py-1 text-[11px] text-muted sm:max-w-72">
                      {signUrl(token)}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copy(row.rank, token)}
                      className="btn-primary px-3 py-1.5 text-xs"
                    >
                      {copied === row.rank ? "Copied!" : "Copy link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void voidLink(row, token)}
                      disabled={busy !== null}
                      className="rounded-full border border-border bg-canvas px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-red-400 hover:text-red-400 disabled:opacity-40"
                    >
                      {isArmed("void") ? "Kill it — sure?" : "Void link"}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void mint(row)}
                  disabled={busy !== null}
                  className="rounded-full border border-border bg-canvas px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-primary hover:text-primary disabled:opacity-40"
                >
                  {busy === row.rank ? "Working…" : token ? "New link" : "Create link"}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        A link signs AS that champion, works once, and dies after {INVITE_DAYS} days — send it straight to the
        person, nowhere public. A spent or botched link can&apos;t be revived: <strong>Void</strong> the old one,{" "}
        <strong>Clear ink</strong> if what got saved isn&apos;t a real signature, and mint a <strong>New link</strong>{" "}
        — a fresh save simply overwrites. Clearing wipes that account&apos;s signature in every season, including one
        the player drew themselves.
      </p>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
