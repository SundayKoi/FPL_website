/**
 * Only a same-site path is ever honored as a post-auth redirect target.
 * Shared by the Discord OAuth callback route and the login page's dev
 * sign-in path, so both enforce the exact same rule against a crafted
 * `next`/`redirect` query param.
 *
 * Rejects:
 * - anything not starting with "/" (an absolute URL like "https://evil.com")
 * - "//evil.com" (protocol-relative — WHATWG treats a leading "//" as an
 *   authority, i.e. a different origin)
 * - any path containing a backslash, e.g. "/\evil.com" — WHATWG URL parsing
 *   treats a backslash the same as a forward slash, so
 *   `new URL("/\\evil.com", origin)` resolves to `https://evil.com/`,
 *   silently hopping origin past the startsWith("/")/startsWith("//")
 *   checks above
 * - belt-and-suspenders: after the string checks pass, resolve it against a
 *   throwaway base origin and confirm the origin didn't change — catches
 *   any other WHATWG parsing quirk we haven't enumerated by name.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  const SENTINEL_ORIGIN = "http://x.invalid";
  try {
    if (new URL(next, SENTINEL_ORIGIN).origin !== SENTINEL_ORIGIN) return "/";
  } catch {
    return "/";
  }
  return next;
}
