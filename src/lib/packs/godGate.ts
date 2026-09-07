import { randomInt } from "node:crypto";
import { GOD_PACK_ODDS_DENOMINATOR } from "./config";

/** Pure form used by tests and simulations: one integer draw in [0, 750). */
export function isGodPackDraw(draw: number): boolean {
  return Number.isInteger(draw) && draw >= 0 && draw < GOD_PACK_ODDS_DENOMINATOR && draw === 0;
}

/** Server-only gate. The ordinary roller never calls this function. */
export function rollGodPackGate(): boolean {
  return isGodPackDraw(randomInt(GOD_PACK_ODDS_DENOMINATOR));
}
