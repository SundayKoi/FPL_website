"use client";

// Claim and sign your offseason card. The same pad and white ink as the
// league's SignaturePad, but the save goes through offseason_sign_card,
// which checks the card is the caller's own (or claims a staff-added spot by
// Riot ID first) and validates the image itself.
//
// Transparent background on purpose: the autograph is laid over the card, so
// only the ink may survive the export. The dark panel behind the canvas is
// for the drawer's benefit.

import { useEffect, useRef, useState, useTransition, type FormEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import type { PlayerCardData } from "@/lib/cards/build";
import { MAX_SIGNATURE_CHARS } from "@/lib/cards/signing";
import { signCardAction } from "@/lib/offseason/actions";
import { findSpot, type ClaimableSpot } from "@/lib/offseason/lockIn";

const PAD_WIDTH = 480;
const PAD_HEIGHT = 160;
const INK_WIDTH = 3;

type Message = { kind: "error" | "done"; text: string } | null;

function Pad({ saving, onSave }: { saving: boolean; onSave: (signature: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  // Size the backing store once: resizing a canvas clears it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
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

  const pointAt = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * PAD_WIDTH, y: ((event.clientY - rect.top) / rect.height) * PAD_HEIGHT };
  };

  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || saving) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { x, y } = pointAt(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    drawing.current = true;
    setDirty(true);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!drawing.current || !ctx) return;
    const { x, y } = pointAt(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const up = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const clear = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    ctx.beginPath();
    setDirty(false);
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <canvas
        ref={canvasRef}
        aria-label="Signature pad: draw your signature"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="w-full touch-none rounded border border-border-subtle bg-canvas"
        style={{ aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}`, cursor: "crosshair" }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => canvasRef.current && onSave(canvasRef.current.toDataURL("image/png"))}
          className="btn-primary px-5 py-2.5 text-sm uppercase tracking-wide disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save signature"}
        </button>
        <button type="button" onClick={clear} disabled={!dirty || saving} className="btn-pill text-sm disabled:opacity-50">
          Clear
        </button>
      </div>
    </div>
  );
}

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-danger" : "text-sm text-success"}>
      {message.text}
    </p>
  );
}

function useSign(eventId: string) {
  const router = useRouter();
  const [saving, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const sign = (signature: string, riotId?: string) => {
    if (signature.length > MAX_SIGNATURE_CHARS) {
      setMessage({ kind: "error", text: "That signature is too detailed. Try a simpler one." });
      return;
    }
    startTransition(async () => {
      const result = await signCardAction({ eventId, signature, riotId });
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setSaved(signature);
      setMessage({ kind: "done", text: "Signed. Your signature is on your card and on the signed copies people pull from packs." });
      router.refresh();
    });
  };
  return { saving, message, saved, sign };
}

/** The viewer's own card: shown with their signature, and a pad to (re)sign it. */
export function SignOwnCard({
  eventId,
  card,
  signature,
}: {
  eventId: string;
  card: PlayerCardData | null;
  signature: string | null;
}) {
  const { saving, message, saved, sign } = useSign(eventId);
  const ink = saved ?? signature;
  return (
    <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
      {card ? (
        <div className="card-cell shrink-0">
          <PlayerCard3D card={{ ...card, season: "Offseason", autograph: ink }} interactive />
        </div>
      ) : null}
      <div className="flex w-full flex-col gap-3">
        {card ? null : (
          <p className="text-sm text-muted">Your card appears after your first rated game. Sign now and it&apos;ll have your signature from the start.</p>
        )}
        {ink && !card ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL the database validated
          <img src={ink} alt="Your saved signature" className="w-full max-w-md rounded border border-border-subtle bg-canvas" />
        ) : null}
        <p className="text-sm text-muted">{ink ? "Signed. Draw a new one to replace it." : "Draw your signature with your mouse or finger."}</p>
        <Pad saving={saving} onSave={(drawn) => sign(drawn)} />
        <Feedback message={message} />
      </div>
    </div>
  );
}

/** A signed-in member with no entry finds the spot staff added for them, then signs it. */
export function ClaimAndSign({ eventId, spots }: { eventId: string; spots: ClaimableSpot[] }) {
  const { saving, message, saved, sign } = useSign(eventId);
  const [typed, setTyped] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const spot = searched === null ? null : findSpot(spots, searched);

  const find = (event: FormEvent) => {
    event.preventDefault();
    setSearched(typed);
  };

  if (saved) return <Feedback message={message} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        In the tournament but not signed up on the site? Enter your Riot ID to find your card. Signing it links it to your account.
      </p>
      <form onSubmit={find} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-white">
          Riot ID
          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Name#NA1"
            className="input-brand w-56 px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" disabled={!typed.trim()} className="btn-pill text-sm disabled:opacity-50">
          Find my card
        </button>
      </form>
      {searched !== null && !spot ? (
        <p className="text-sm text-muted">No unclaimed card has that Riot ID. Check it matches the one you gave staff, or ask in Discord.</p>
      ) : null}
      {spot ? (
        <>
          <p className="text-sm text-muted">
            Found you: <span className="font-semibold text-white">{spot.displayName}</span> ({spot.riotId}). Sign below to claim it.
          </p>
          <Pad saving={saving} onSave={(drawn) => sign(drawn, spot.riotId)} />
        </>
      ) : null}
      <Feedback message={message} />
    </div>
  );
}
