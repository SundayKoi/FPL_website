"use client";

// The owner's counter for one-time signing links. Two of the Hand's five
// champions aren't site members, so their real ink has to arrive through
// a bearer link: mint one here, copy it, DM it. Each row shows whether
// that champion's ink is already on file (the mint only rolls autographs
// for real ink) and whether a live link is already out.
//
// Minting goes through createSignatureInviteAction (owner-gated server
// side too — this component is just the counter top).

import { useState } from "react";
import { createSignatureInviteAction } from "@/lib/cards/signing-actions";
import { INVITE_DAYS } from "@/lib/cards/signing";

export interface SigningDeskRow {
  rank: string;
  name: string;
  summoner: string;
  tag: string;
  /** Real drawn ink already in card_art_prefs under this account. */
  hasInk: boolean;
  /** Latest unused, unexpired invite already minted, if any. */
  invite: { token: string; expiresAt: string } | null;
}

function signUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/sign/${token}`;
}

export default function ChampionsSigningDesk({ rows, season }: { rows: SigningDeskRow[]; season: string }) {
  // rank → freshly minted token this visit (newer than the server-fetched
  // invite prop, so it wins the display).
  const [minted, setMinted] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mint = async (row: SigningDeskRow) => {
    setBusy(row.rank);
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
          const token = minted[row.rank] ?? row.invite?.token ?? null;
          return (
            <li
              key={row.rank}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-line bg-panel px-4 py-3"
            >
              <span className="w-14 shrink-0 font-mono text-sm text-steel">{row.rank}♠</span>
              <span className="min-w-32 text-sm font-semibold text-white">{row.name}</span>
              {row.hasInk ? (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">
                  Ink on file
                </span>
              ) : (
                <span className="rounded-full border border-line bg-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-steel">
                  No ink
                </span>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {token ? (
                  <>
                    <code className="max-w-56 truncate rounded bg-navy px-2 py-1 text-[11px] text-steel sm:max-w-72">
                      {signUrl(token)}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copy(row.rank, token)}
                      className="btn-coral px-3 py-1.5 text-xs"
                    >
                      {copied === row.rank ? "Copied!" : "Copy link"}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void mint(row)}
                  disabled={busy !== null}
                  className="rounded-full border border-line bg-navy px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral disabled:opacity-40"
                >
                  {busy === row.rank ? "Minting…" : token ? "New link" : "Create link"}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-steel">
        A link signs AS that champion, works once, and dies after {INVITE_DAYS} days — send it straight to the
        person, nowhere public. Minting a new link doesn&apos;t revoke an old one until it&apos;s used or expires.
      </p>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
