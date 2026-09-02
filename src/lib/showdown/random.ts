import "server-only";
import { randomBytes } from "node:crypto";

/** A uniform [0, 1) from the CSPRNG — the same source the pack roller
 *  draws from. Six bytes over 2^48 leaves no bias worth naming. */
export function secureRand(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}
