// Verifies a Discord interaction webhook's Ed25519 signature. Discord signs
// `timestamp + rawBody` with its per-app public key (hex-encoded in
// DISCORD_PUBLIC_KEY) — the caller MUST pass the *raw* request body text
// (read via `await req.text()` before any JSON.parse), since re-serializing
// parsed JSON can change byte-for-byte content and break verification.
export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string,
): Promise<boolean> {
  const hex = (s: string) => Uint8Array.from(s.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", hex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify(
    "Ed25519",
    key,
    hex(signatureHex),
    new TextEncoder().encode(timestamp + rawBody),
  );
}
