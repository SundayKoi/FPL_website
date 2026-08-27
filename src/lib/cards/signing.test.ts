import { describe, expect, it } from "vitest";
import { inviteExpired, MAX_SIGNATURE_CHARS, validSignatureDataUrl } from "./signing";

// A minimal legitimate export: what canvas.toDataURL("image/png") yields.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("validSignatureDataUrl", () => {
  it("accepts a real PNG data URL", () => {
    expect(validSignatureDataUrl(TINY_PNG)).toBe(true);
  });

  it("rejects everything that isn't a string", () => {
    for (const value of [null, undefined, 42, { data: TINY_PNG }, [TINY_PNG]]) {
      expect(validSignatureDataUrl(value)).toBe(false);
    }
  });

  it("rejects non-PNG payloads — this string renders as an <img src> on real cards", () => {
    expect(validSignatureDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe(false);
    expect(validSignatureDataUrl("javascript:alert(1)")).toBe(false);
    expect(validSignatureDataUrl("https://evil.example/sig.png")).toBe(false);
    expect(validSignatureDataUrl("data:image/png;base64,not*base64*at&all")).toBe(false);
    expect(validSignatureDataUrl("")).toBe(false);
  });

  it("enforces the same size cap as the card_art_prefs column check", () => {
    const filler = "A".repeat(MAX_SIGNATURE_CHARS);
    expect(validSignatureDataUrl(`data:image/png;base64,${filler}`)).toBe(false);
    // At the cap exactly it still passes — the guard is <=, like the column.
    const prefix = "data:image/png;base64,";
    const atCap = prefix + "A".repeat(MAX_SIGNATURE_CHARS - prefix.length);
    expect(atCap.length).toBe(MAX_SIGNATURE_CHARS);
    expect(validSignatureDataUrl(atCap)).toBe(true);
  });
});

describe("inviteExpired", () => {
  it("splits past from future against the wall clock", () => {
    expect(inviteExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(inviteExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });

  it("treats an unparseable timestamp as expired, never as live", () => {
    expect(inviteExpired("not a date")).toBe(true);
  });
});
