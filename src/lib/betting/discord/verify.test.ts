import { describe, expect, it } from "vitest";
import { verifyDiscordSignature } from "./verify";

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function makeSignedRequest(timestamp: string, body: string) {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const signature = await crypto.subtle.sign(
    "Ed25519",
    keyPair.privateKey,
    new TextEncoder().encode(timestamp + body),
  );
  return { publicKeyHex: toHex(publicKeyRaw), signatureHex: toHex(signature) };
}

describe("verifyDiscordSignature", () => {
  it("returns true for a validly signed body", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { publicKeyHex, signatureHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature(publicKeyHex, signatureHex, timestamp, body);

    expect(ok).toBe(true);
  });

  it("returns false when the body has been tampered with", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { publicKeyHex, signatureHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature(publicKeyHex, signatureHex, timestamp, body + "tampered");

    expect(ok).toBe(false);
  });

  it("returns false when the timestamp has been tampered with", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { publicKeyHex, signatureHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature(publicKeyHex, signatureHex, "1700000000", body);

    expect(ok).toBe(false);
  });

  it("returns false for a signature made with a different key", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { signatureHex } = await makeSignedRequest(timestamp, body);
    const { publicKeyHex: otherPublicKeyHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature(otherPublicKeyHex, signatureHex, timestamp, body);

    expect(ok).toBe(false);
  });

  // Regression coverage: signatureHex/publicKeyHex are untrusted request
  // headers, so malformed shapes must resolve to `false`, never throw —
  // the bare `s.match(/.{2}/g)!` from the brief's snippet throws on a
  // 1-char string (null! deref) and silently truncates odd-length input.
  it("returns false for a 1-char signature", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { publicKeyHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature(publicKeyHex, "a", timestamp, body);

    expect(ok).toBe(false);
  });

  it("returns false for an odd-length signature", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { publicKeyHex, signatureHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature(publicKeyHex, signatureHex.slice(0, -1), timestamp, body);

    expect(ok).toBe(false);
  });

  it("returns false for a well-formed but wrong-length hex signature (32 bytes instead of 64)", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { publicKeyHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature(publicKeyHex, "ab".repeat(32), timestamp, body);

    expect(ok).toBe(false);
  });

  it("returns false for a well-formed but wrong-length hex public key (16 bytes instead of 32)", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { signatureHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature("ab".repeat(16), signatureHex, timestamp, body);

    expect(ok).toBe(false);
  });

  it("returns false for non-hex garbage in the signature", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { publicKeyHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature(publicKeyHex, "zz".repeat(64), timestamp, body);

    expect(ok).toBe(false);
  });

  it("returns false for an empty signature", async () => {
    const timestamp = "1699999999";
    const body = JSON.stringify({ type: 1 });
    const { publicKeyHex } = await makeSignedRequest(timestamp, body);

    const ok = await verifyDiscordSignature(publicKeyHex, "", timestamp, body);

    expect(ok).toBe(false);
  });
});
