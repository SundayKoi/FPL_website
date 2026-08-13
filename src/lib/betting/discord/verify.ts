// Verifies a Discord interaction webhook's Ed25519 signature. Discord signs
// `timestamp + rawBody` with its per-app public key (hex-encoded in
// DISCORD_PUBLIC_KEY) — the caller MUST pass the *raw* request body text
// (read via `await req.text()` before any JSON.parse), since re-serializing
// parsed JSON can change byte-for-byte content and break verification.
//
// Untrusted input note: `signatureHex`/`publicKeyHex` come straight off
// request headers, so they can be any length/content an attacker chooses —
// not just well-formed 64/32-byte hex. `hex()` below validates shape before
// decoding (rather than the brief's bare `s.match(/.{2}/g)!`, which throws
// on a 1-char string and silently truncates odd-length input), and the
// whole verify is wrapped in try/catch so any crypto-layer rejection (e.g.
// right-shaped-but-wrong-length hex) also resolves to `false` instead of
// throwing — the route's caller treats every `false` as an ordinary 401,
// never an uncaught 500.
function hexToBytes(s: string, expectedByteLength: number): Uint8Array<ArrayBuffer> | null {
  if (s.length !== expectedByteLength * 2 || !/^[0-9a-fA-F]+$/.test(s)) return null;
  const matches = s.match(/.{2}/g);
  if (!matches) return null;
  return Uint8Array.from(matches.map((b) => parseInt(b, 16)));
}

export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string,
): Promise<boolean> {
  const publicKeyBytes = hexToBytes(publicKeyHex, 32);
  const signatureBytes = hexToBytes(signatureHex, 64);
  if (!publicKeyBytes || !signatureBytes) return false;

  try {
    const key = await crypto.subtle.importKey("raw", publicKeyBytes, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      signatureBytes,
      new TextEncoder().encode(timestamp + rawBody),
    );
  } catch {
    return false;
  }
}
