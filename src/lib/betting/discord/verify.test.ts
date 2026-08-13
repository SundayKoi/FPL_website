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
});
