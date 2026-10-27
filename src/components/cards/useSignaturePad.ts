"use client";

// The drawing behind every signature pad (SignaturePad, InviteSignaturePad
// and the offseason's SignCard). Strokes are kept in a list, so a signature
// can be undone a stroke at a time and the eraser can rub out part of it
// instead of clearing the lot. An undo replays the list from scratch.
//
// The eraser cuts ink away (destination-out) rather than painting over it,
// so the exported PNG stays transparent with only the ink on it.

import { useEffect, useRef, useState, type PointerEvent } from "react";

export type PadTool = "pen" | "eraser";
type Point = { x: number; y: number };
type Stroke = { tool: PadTool; color: string; points: Point[] };

/** Wide enough to catch a pen line with a fingertip, whatever the ink's width. */
export const ERASER_WIDTH = 18;

export function useSignaturePad({
  width,
  height,
  inkWidth,
  color,
  disabled = false,
  onChange,
}: {
  /** Canvas size in CSS pixels; the backing store is scaled by the device pixel ratio. */
  width: number;
  height: number;
  inkWidth: number;
  /** The pen's colour for the next stroke. Earlier strokes keep theirs. */
  color: string;
  disabled?: boolean;
  /** Called after anything changes the drawing: a stroke starts, an undo, a clear. */
  onChange?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<PadTool>("pen");
  // What the controls need, kept in state so render never reads the stroke list.
  const [summary, setSummary] = useState({ strokes: 0, inked: false });

  // Size the backing store once: resizing a canvas clears it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
  }, [width, height]);

  const context = () => canvasRef.current?.getContext("2d") ?? null;

  /** Sets the context up for `stroke` and marks its first point (a tap is a dot). */
  const start = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.tool === "eraser" ? ERASER_WIDTH : inkWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const [first] = stroke.points;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    ctx.lineTo(first.x, first.y);
    ctx.stroke();
  };

  const changed = () => {
    setSummary({ strokes: strokes.current.length, inked: strokes.current.some((stroke) => stroke.tool === "pen") });
    onChange?.();
  };

  const redraw = () => {
    const ctx = context();
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    // The context is scaled, so the CSS-pixel rect covers the whole backing store.
    ctx.clearRect(0, 0, width, height);
    for (const stroke of strokes.current) {
      start(ctx, stroke);
      for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  };

  /** Pointer position in canvas (CSS-pixel) coordinates. */
  const pointAt = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * width, y: ((event.clientY - rect.top) / rect.height) * height };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    // Capture, so a stroke that wanders off the pad keeps going until the pen lifts.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const stroke: Stroke = { tool, color, points: [pointAt(event)] };
    current.current = stroke;
    strokes.current = [...strokes.current, stroke];
    const ctx = context();
    if (ctx) start(ctx, stroke);
    changed();
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current;
    if (!stroke) return;
    const point = pointAt(event);
    stroke.points.push(point);
    const ctx = context();
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    current.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  /** Takes back the last stroke, pen or eraser. */
  const undo = () => {
    if (strokes.current.length === 0) return;
    strokes.current = strokes.current.slice(0, -1);
    redraw();
    changed();
  };

  const clear = () => {
    strokes.current = [];
    current.current = null;
    redraw();
    setTool("pen");
    changed();
  };

  /** The drawing as a PNG data URL, or null when nothing is left on the pad. */
  const exportPng = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = context();
    if (ctx && typeof ctx.getImageData === "function") {
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let blank = true;
      for (let alpha = 3; alpha < data.length; alpha += 4) {
        if (data[alpha] !== 0) {
          blank = false;
          break;
        }
      }
      if (blank) return null;
    }
    return canvas.toDataURL("image/png");
  };

  return {
    tool,
    setTool,
    /** Something has been drawn, even if the eraser has since taken it all. */
    dirty: summary.strokes > 0,
    /** At least one pen stroke is still in the list. */
    inked: summary.inked,
    canUndo: summary.strokes > 0,
    undo,
    clear,
    exportPng,
    canvasProps: {
      ref: canvasRef,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      style: { aspectRatio: `${width} / ${height}`, cursor: tool === "eraser" ? "cell" : "crosshair" },
    },
  };
}
