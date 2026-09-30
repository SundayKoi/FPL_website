/** Whether the visitor asked for reduced motion. False on the server and
 *  wherever matchMedia is unavailable, so animation stays progressive
 *  polish rather than a gate. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
