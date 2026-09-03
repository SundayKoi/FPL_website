// The Pusher's pretend physics: a top-down shelf, a bar that sweeps, discs
// that shove each other toward the lip. Pure and frame-stepped so the toy
// can be tested without a browser. The real machine would not use this —
// it would settle a small deterministic column model on the server and
// animate to it — so nothing here is load-bearing beyond the mockup.

import { COIN_VALUE, PRIZES, type PrizeKind } from "@/lib/pusher/config";

export const W = 340;
export const D = 460;
export const LIP = D - 36;
export const GUTTER = 44;
export const COIN_R = 11;
const PRIZE_R = 17;
export const PUSH_MIN = 24;
export const PUSH_MAX = 118;
export const PUSH_SPEED = 0.9;

export type Kind = "coin" | PrizeKind;
export interface Disc {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}


export const COLORS: Record<Kind, string> = { coin: "#f5b62e", dust: "#b06bff", token: "#35e6ff", card: "#ff6b35" };

export function seedShelf(rand: () => number): Disc[] {
  const discs: Disc[] = [];
  let id = 0;
  // Coins packed from the lip back, jittered so they do not sit in a lattice.
  for (let row = 0; row < 7; row += 1) {
    const y = LIP - 6 - row * (COIN_R * 2 - 2);
    const offset = row % 2 ? COIN_R : 0;
    for (let x = GUTTER + COIN_R + offset; x < W - GUTTER - COIN_R; x += COIN_R * 2 + 1) {
      if (rand() < 0.12) continue;
      discs.push({ id: (id += 1), kind: "coin", x: x + (rand() - 0.5) * 3, y: y + (rand() - 0.5) * 3, vx: 0, vy: 0, r: COIN_R });
    }
  }
  const prizeKinds = (Object.keys(PRIZES) as PrizeKind[]).flatMap((kind) => Array.from({ length: PRIZES[kind].seeded }, () => kind));
  for (const kind of prizeKinds) {
    discs.push({
      id: (id += 1),
      kind,
      x: GUTTER + PRIZE_R + rand() * (W - 2 * GUTTER - 2 * PRIZE_R),
      y: LIP - 40 - rand() * 120,
      vx: 0,
      vy: 0,
      r: PRIZE_R,
    });
  }
  return discs;
}

/** One frame of the pretend physics. Returns what fell off the lip and
 *  what was lost down the sides. */
export function step(discs: Disc[], pushEdge: number, pushDelta: number): { paid: Disc[]; lost: Disc[] } {
  // The bar shoves anything it overlaps forward.
  for (const disc of discs) {
    if (disc.y - disc.r < pushEdge) {
      disc.y = pushEdge + disc.r;
      disc.vy = Math.max(disc.vy, pushDelta);
    }
  }
  // Discs push each other apart; a shove propagates through the pile.
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < discs.length; i += 1) {
      for (let j = i + 1; j < discs.length; j += 1) {
        const a = discs[i];
        const b = discs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const overlap = a.r + b.r - dist;
        if (overlap <= 0) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const half = overlap / 2;
        a.x -= nx * half;
        a.y -= ny * half;
        b.x += nx * half;
        b.y += ny * half;
      }
    }
  }
  // Move, with heavy friction: a coin slides a little, then stops.
  for (const disc of discs) {
    disc.x += disc.vx;
    disc.y += disc.vy;
    disc.vx *= 0.6;
    disc.vy *= 0.6;
    if (disc.x < disc.r) disc.x = disc.r;
    if (disc.x > W - disc.r) disc.x = W - disc.r;
  }
  const paid: Disc[] = [];
  const lost: Disc[] = [];
  const keep: Disc[] = [];
  for (const disc of discs) {
    if (disc.y - disc.r > LIP) {
      (disc.x > GUTTER && disc.x < W - GUTTER ? paid : lost).push(disc);
    } else {
      keep.push(disc);
    }
  }
  discs.length = 0;
  discs.push(...keep);
  return { paid, lost };
}

export function draw(ctx: CanvasRenderingContext2D, discs: Disc[], pushEdge: number, dropX: number | null) {
  ctx.clearRect(0, 0, W, D);
  // Shelf, gutters, lip.
  ctx.fillStyle = "#18232e";
  ctx.fillRect(0, 0, W, D);
  ctx.fillStyle = "#101820";
  ctx.fillRect(0, 0, GUTTER, D);
  ctx.fillRect(W - GUTTER, 0, GUTTER, D);
  ctx.fillStyle = "#0b1420";
  ctx.fillRect(0, LIP, W, D - LIP);
  ctx.fillStyle = "#2ee6a8";
  ctx.fillRect(GUTTER, LIP, W - 2 * GUTTER, 2);
  ctx.fillStyle = "#ff5c6c";
  ctx.fillRect(0, LIP, GUTTER, 2);
  ctx.fillRect(W - GUTTER, LIP, GUTTER, 2);
  // The bar.
  ctx.fillStyle = "#2a3947";
  ctx.fillRect(0, 0, W, pushEdge);
  ctx.fillStyle = "#526678";
  ctx.fillRect(0, pushEdge - 4, W, 4);
  // Discs.
  for (const disc of discs) {
    ctx.beginPath();
    ctx.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[disc.kind];
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#0b1420";
    ctx.font = `bold ${disc.kind === "coin" ? 9 : 8}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(disc.kind === "coin" ? `$${COIN_VALUE}` : disc.kind === "dust" ? "DUST" : disc.kind === "token" ? "PACK" : "CARD", disc.x, disc.y);
  }
  // Aim marker.
  if (dropX !== null) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(dropX, 0);
    ctx.lineTo(dropX, LIP);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

