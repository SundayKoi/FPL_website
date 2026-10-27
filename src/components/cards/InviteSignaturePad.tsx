"use client";

// The signing pad behind a one-time link (/sign/<token>) — SignaturePad's
// sibling for people who aren't site members. Same canvas, same ink, but
// the save goes through submitInviteSignatureAction with the bearer token
// instead of a client-side RLS write: the visitor has no session, and the
// token is the whole authorization.
//
// One shot by design — after a successful save the pad is done, because
// the token burned server-side. The eraser, undo and "Clear" before saving
// are still free (useSignaturePad).

import { useState } from "react";
import { submitInviteSignatureAction } from "@/lib/cards/signing-actions";
import { MAX_SIGNATURE_CHARS } from "@/lib/cards/signing";
import SignaturePadTools from "./SignaturePadTools";
import { useSignaturePad } from "./useSignaturePad";

/** Canvas size in CSS pixels; backing store scales by devicePixelRatio so
 *  a phone signature isn't a blurry upscale. Matches SignaturePad. */
const PAD_WIDTH = 480;
const PAD_HEIGHT = 160;

const INK_WIDTH = 3;

const TOOL_BUTTON =
  "rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:opacity-40";

export default function InviteSignaturePad({ token }: { token: string }) {
  // The save is one-shot (it burns the link), so it takes two taps: the
  // first arms, the second fires. Any change to the drawing disarms.
  const [saveArmed, setSaveArmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pad = useSignaturePad({
    width: PAD_WIDTH,
    height: PAD_HEIGHT,
    inkWidth: INK_WIDTH,
    color: "#ffffff",
    disabled: saved || saving,
    onChange: () => {
      setSaveArmed(false);
      setError(null);
    },
  });

  const save = async () => {
    if (saved) return;
    const signature = pad.exportPng();
    if (!signature) {
      setError("The pad is empty — draw your signature first.");
      return;
    }
    if (!saveArmed) {
      setSaveArmed(true);
      return;
    }
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
        <p className="text-xs text-muted">
          Your ink is on file — from now on, your champions card can come out of the pack autographed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2">
      <canvas
        {...pad.canvasProps}
        aria-label="Signature pad — draw your signature"
        className="w-full max-w-full touch-none rounded border border-border-subtle bg-canvas"
      />
      <SignaturePadTools tool={pad.tool} onTool={pad.setTool} canUndo={pad.canUndo} onUndo={pad.undo} disabled={saving} buttonClass={TOOL_BUTTON} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={pad.clear} disabled={saving || !pad.dirty} className={TOOL_BUTTON}>
          Clear
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !pad.dirty}
          className="btn-primary px-4 py-1.5 text-xs disabled:opacity-40"
        >
          {saving ? "Saving…" : saveArmed ? "Happy with it? Tap again" : "Sign it"}
        </button>
      </div>
      <p className="text-[11px] text-muted">One save only — the link retires once your signature lands.</p>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
