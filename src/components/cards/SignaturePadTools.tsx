"use client";

// Pen, eraser and undo for a signature pad (useSignaturePad). Each pad passes
// its own button look so the tools match the pad's other buttons.

import type { PadTool } from "./useSignaturePad";

// A ring rather than a colour change, so the chosen tool reads on any button style.
const PRESSED = "aria-pressed:ring-2 aria-pressed:ring-white aria-pressed:ring-offset-2 aria-pressed:ring-offset-canvas";

export default function SignaturePadTools({
  tool,
  onTool,
  canUndo,
  onUndo,
  disabled = false,
  buttonClass,
}: {
  tool: PadTool;
  onTool: (tool: PadTool) => void;
  canUndo: boolean;
  onUndo: () => void;
  disabled?: boolean;
  buttonClass: string;
}) {
  return (
    <div role="group" aria-label="Signature tools" className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={tool === "pen"} disabled={disabled} onClick={() => onTool("pen")} className={`${buttonClass} ${PRESSED}`}>
        Pen
      </button>
      <button
        type="button"
        aria-pressed={tool === "eraser"}
        disabled={disabled}
        onClick={() => onTool("eraser")}
        className={`${buttonClass} ${PRESSED}`}
      >
        Eraser
      </button>
      <button type="button" disabled={disabled || !canUndo} onClick={onUndo} className={buttonClass}>
        Undo
      </button>
    </div>
  );
}
