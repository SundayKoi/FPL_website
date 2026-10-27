"use client";

// Sign your card. The player draws with a pointer or a finger (with an eraser
// and undo for slips, useSignaturePad), and the drawing is saved to
// card_art_prefs as a small transparent PNG — from then on a small fraction of
// that player's pack pulls come out with the ink on them (SIGNED_CHANCE scaled
// by signedChance, src/lib/packs/signatures.ts).
//
// Transparent background on purpose: the autograph is laid over whatever
// splash the card wears, so only the ink itself may survive the export. The
// dark panel behind the canvas is there for the drawer's benefit — white
// ink on nothing is invisible while you're writing it.
//
// Writes go straight from the client like SkinPicker's, and RLS
// (can_edit_card_art, 20260826000013) is what actually authorizes them —
// the server only decides whether to render this at all.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_SIGNATURE_CHARS } from "@/lib/cards/signing";
import { createClient } from "@/lib/supabase/client";
import SignaturePadTools from "./SignaturePadTools";
import { useSignaturePad } from "./useSignaturePad";

/** Canvas size in CSS pixels. The backing store is scaled by the device
 *  pixel ratio so a phone signature isn't a blurry upscale. */
const PAD_WIDTH = 480;
const PAD_HEIGHT = 160;

const INK_WIDTH = 3;

/** The pad's inks. White is everyone's; gold and crimson are the patron
 *  pen case — a purely cosmetic flex, so the gate is the UI offering them
 *  (the stored PNG simply carries whatever colour was drawn). */
const INKS = {
  white: { label: "White", color: "#ffffff" },
  gold: { label: "Gold", color: "#f0c96a" },
  crimson: { label: "Crimson", color: "#ff5063" },
} as const;
type InkKey = keyof typeof INKS;

const TOOL_BUTTON =
  "rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:opacity-40";

export default function SignaturePad({
  season,
  summonerName,
  tag,
  currentSignature = null,
  patronInks = false,
}: {
  season: string;
  summonerName: string;
  tag: string;
  currentSignature?: string | null;
  /** Active patron — unlocks the gold and crimson inks. */
  patronInks?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [ink, setInk] = useState<InkKey>("white");
  const [error, setError] = useState<string | null>(null);
  // Ink swaps colour the strokes from here on; earlier strokes keep theirs.
  // Mixing colours mid-signature is allowed on purpose.
  const pad = useSignaturePad({
    width: PAD_WIDTH,
    height: PAD_HEIGHT,
    inkWidth: INK_WIDTH,
    color: INKS[ink].color,
    onChange: () => setError(null),
  });

  const write = async (signature: string | null) => {
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("card_art_prefs")
      .upsert({ season, summoner_name: summonerName, tag, signature }, { onConflict: "season,summoner_name,tag" });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    router.refresh();
  };

  const save = async () => {
    const signature = pad.exportPng();
    if (!signature) {
      setError("The pad is empty — draw your signature first.");
      return;
    }
    // The column's check in 20260826000016, guarded here so a too-detailed
    // scrawl gets an explanation instead of a Postgres error.
    if (signature.length > MAX_SIGNATURE_CHARS) {
      setError("That signature is too detailed — try a simpler one.");
      return;
    }
    await write(signature);
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2">
      {currentSignature ? (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">On file</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentSignature}
            alt={`${summonerName}'s signature`}
            className="h-16 w-auto max-w-full rounded bg-canvas object-contain px-2"
          />
        </div>
      ) : null}
      {patronInks ? (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Ink</span>
          {(Object.keys(INKS) as InkKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={ink === key}
              title={`${INKS[key].label} ink`}
              onClick={() => setInk(key)}
              className={`h-5 w-5 rounded-full border-2 transition ${
                ink === key ? "scale-110 border-white" : "border-border-subtle opacity-70 hover:opacity-100"
              }`}
              style={{ background: INKS[key].color }}
            >
              <span className="sr-only">{INKS[key].label} ink</span>
            </button>
          ))}
          <span className="text-[10px] text-muted">Patron pen case — gold &amp; crimson</span>
        </div>
      ) : null}
      <canvas
        {...pad.canvasProps}
        aria-label="Signature pad — draw your signature"
        className="w-full max-w-full touch-none rounded border border-border-subtle bg-canvas"
      />
      <SignaturePadTools tool={pad.tool} onTool={pad.setTool} canUndo={pad.canUndo} onUndo={pad.undo} disabled={saving} buttonClass={TOOL_BUTTON} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={pad.clear}
          disabled={saving || !pad.dirty}
          className={TOOL_BUTTON}
        >
          Clear
        </button>
        <button type="button" onClick={() => void save()} disabled={saving || !pad.dirty} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-40">
          Save
        </button>
        {currentSignature ? (
          <button
            type="button"
            onClick={() => void write(null)}
            disabled={saving}
            className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-red-400 hover:text-red-400 disabled:opacity-40"
          >
            Remove signature
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
