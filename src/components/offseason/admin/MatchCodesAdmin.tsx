"use client";

import { useState } from "react";
import { addMatchCodesAction, removeMatchCodeAction } from "@/lib/offseason/actions";
import { gamesNeedingCodes, parseCodes } from "@/lib/offseason/codes";
import { ActionMessage, buttonClass, inputClass, primaryButtonClass, useOffseasonAction, type OffseasonAdminData } from "./shared";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The event's tournament codes: paste a batch, see what is waiting, throw a bad one away. */
export default function MatchCodesAdmin({ data }: { data: OffseasonAdminData }) {
  const [text, setText] = useState("");
  const { pending, message, setMessage, run } = useOffseasonAction();
  const pasted = parseCodes(text);
  const pool = data.codes.filter((code) => !code.match_id);
  const needed = gamesNeedingCodes(data, data.codes);

  function add() {
    let summary = "";
    run(
      async () => {
        const result = await addMatchCodesAction(data.event.id, pasted);
        if (result.ok) {
          summary =
            `Added ${plural(result.added, "code")}${result.skipped ? ` (${result.skipped} already stored)` : ""}. ` +
            `${plural(result.assigned, "went to a game", "went to games")}; ${plural(result.pooled, "is waiting", "are waiting")} for new matches.`;
        }
        return result;
      },
      undefined,
      () => {
        setText("");
        setMessage({ kind: "done", text: summary });
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Paste Riot tournament codes, one per line. Every game on the schedule takes the next code, in schedule order, and matches
        scheduled later take theirs from what&apos;s waiting. A decided series hands back the codes of games it didn&apos;t play.
        Players see their own matches&apos; codes on the overview; nobody else does.
      </p>
      <p className={needed > 0 ? "text-sm text-prestige" : "text-sm text-content"}>
        {needed > 0 ? `${plural(needed, "game")} still ${needed === 1 ? "needs" : "need"} a code.` : "Every scheduled game has a code."}{" "}
        <span className="text-muted">{plural(pool.length, "code")} waiting.</span>
      </p>
      <textarea
        aria-label="Tournament codes to add"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="NA0…-…"
        className={`${inputClass} font-mono`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || pasted.length === 0} className={primaryButtonClass} onClick={add}>
          {pasted.length > 0 ? `Add ${plural(pasted.length, "code")}` : "Add codes"}
        </button>
        <ActionMessage message={message} />
      </div>
      {pool.length > 0 ? (
        <details className="rounded-md border border-border-subtle p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-muted">Waiting codes</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {pool.map((code) => (
              <li key={code.id} className="flex flex-wrap items-center gap-2 text-xs">
                <code className="break-all font-mono text-content">{code.code}</code>
                <button
                  type="button"
                  disabled={pending}
                  className={buttonClass}
                  onClick={() => run(() => removeMatchCodeAction(code.id), "Code removed.")}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
