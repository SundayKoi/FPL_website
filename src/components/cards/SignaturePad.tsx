"use client";

// Sign your card. The player draws once, with a pointer or a finger, and the
// stroke is saved to card_art_prefs as a small transparent PNG — from then
// on a tiny fraction of that player's pack pulls come out with the ink on
// them (SIGNED_CHANCE, src/lib/packs/config.ts).
//
// Transparent background on purpose: the autograph is laid over whatever
// splash the card wears, so only the ink itself may survive the export. The
// dark panel behind the canvas is there for the drawer's benefit — white
// ink on nothing is invisible while you're writing it.
//
// Writes go straight from the client like SkinPicker's, and RLS
// (can_edit_card_art, 20260826000013) is what actually authorizes them —
// the server only decides whether to render this at all.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Canvas size in CSS pixels. The backing store is scaled by the device
 *  pixel ratio so a phone signature isn't a blurry upscale. */
const PAD_WIDTH = 480;
const PAD_HEIGHT = 160;

/** Matches the column's check in 20260826000016 — guarded here so a too-
 *  detailed scrawl gets an explanation instead of a Postgres error. */
const MAX_SIGNATURE_CHARS = 80000;

const INK_WIDTH = 3;

export default function SignaturePad({
  season,
  summonerName,
  tag,
  currentSignature = null,
}: {
  season: string;
  summonerName: string;
  tag: string;
  currentSignature?: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Size the backing store once, then keep the drawing context configured —
  // resizing a canvas clears it, so this must not run on every stroke.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = PAD_WIDTH * ratio;
    canvas.height = PAD_HEIGHT * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = INK_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
  }, []);

  /** Pointer position in canvas (CSS-pixel) coordinates. */
  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * PAD_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * PAD_HEIGHT,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Capture, so a stroke that wanders off the pad keeps drawing until the
    // pen is lifted rather than ending mid-letter.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { x, y } = pointAt(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A tap with no drag is still a mark (the dot on an i).
    ctx.lineTo(x, y);
    ctx.stroke();
    drawing.current = true;
    setDirty(true);
    setError(null);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointAt(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // Clearing in device pixels: the context is scaled, so the CSS-pixel
    // rect covers the whole backing store.
    ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    ctx.beginPath();
    setDirty(false);
    setError(null);
  };

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signature = canvas.toDataURL("image/png");
    if (signature.length > MAX_SIGNATURE_CHARS) {
      setError("That signature is too detailed — try a simpler one.");
      return;
    }
    await write(signature);
    setDirty(false);
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2">
      {currentSignature ? (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-steel">On file</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentSignature}
            alt={`${summonerName}'s signature`}
            className="h-16 w-auto max-w-full rounded bg-navy object-contain px-2"
          />
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        aria-label="Signature pad — draw your signature"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="w-full max-w-full touch-none rounded border border-line bg-navy"
        style={{ aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}`, cursor: "crosshair" }}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={clear}
          disabled={saving || !dirty}
          className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral disabled:opacity-40"
        >
          Clear
        </button>
        <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="btn-coral px-4 py-1.5 text-xs disabled:opacity-40">
          Save
        </button>
        {currentSignature ? (
          <button
            type="button"
            onClick={() => void write(null)}
            disabled={saving}
            className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-red-400 hover:text-red-400 disabled:opacity-40"
          >
            Remove signature
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
