"use client";

// The signing pad behind a one-time link (/sign/<token>) — SignaturePad's
// sibling for people who aren't site members. Same canvas, same ink, but
// the save goes through submitInviteSignatureAction with the bearer token
// instead of a client-side RLS write: the visitor has no session, and the
// token is the whole authorization.
//
// One shot by design — after a successful save the pad is done, because
// the token burned server-side. "Clear" before saving is still free.

import { useEffect, useRef, useState } from "react";
import { submitInviteSignatureAction } from "@/lib/cards/signing-actions";
import { MAX_SIGNATURE_CHARS } from "@/lib/cards/signing";

/** Canvas size in CSS pixels; backing store scales by devicePixelRatio so
 *  a phone signature isn't a blurry upscale. Matches SignaturePad. */
const PAD_WIDTH = 480;
const PAD_HEIGHT = 160;

const INK_WIDTH = 3;

export default function InviteSignaturePad({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  // The save is one-shot (it burns the link), so it takes two taps: the
  // first arms, the second fires. Drawing or clearing disarms.
  const [saveArmed, setSaveArmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Size the backing store once — resizing a canvas clears it.
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

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * PAD_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * PAD_HEIGHT,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (saved || saving) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Capture, so a stroke that wanders off the pad keeps drawing until
    // the pen lifts rather than ending mid-letter.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { x, y } = pointAt(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A tap with no drag is still a mark (the dot on an i).
    ctx.lineTo(x, y);
    ctx.stroke();
    drawing.current = true;
    setDirty(true);
    setSaveArmed(false);
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
    ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    ctx.beginPath();
    setDirty(false);
    setSaveArmed(false);
    setError(null);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || saved) return;
    if (!saveArmed) {
      setSaveArmed(true);
      return;
    }
    const signature = canvas.toDataURL("image/png");
    if (signature.length > MAX_SIGNATURE_CHARS) {
      setError("That signature is too detailed — try a simpler one.");
      return;
    }
    setSaveArmed(false);
    setSaving(true);
    setError(null);
    const result = await submitInviteSignatureAction(token, signature);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
  };

  if (saved) {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-2 text-center">
        <span className="text-2xl">🖋️</span>
        <p className="text-sm font-semibold text-white">Signature saved.</p>
        <p className="text-xs text-steel">
          Your ink is on file — from now on, your champions card can come out of the pack autographed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2">
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
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="btn-coral px-4 py-1.5 text-xs disabled:opacity-40"
        >
          {saving ? "Saving…" : saveArmed ? "Happy with it? Tap again" : "Sign it"}
        </button>
      </div>
      <p className="text-[11px] text-steel">One save only — the link retires once your signature lands.</p>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
