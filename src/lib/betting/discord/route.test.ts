import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// route.ts imports commands.ts for its registration side effect, which
// transitively imports service-client.ts (`import "server-only"`) — same
// stub as commands.test.ts/queries.test.ts (vitest resolves that package's
// default "throws by design" export, not the "react-server" condition
// Next.js's bundler swaps it for).
vi.mock("server-only", () => ({}));

import { POST } from "@/app/api/discord/interactions/route";
import { autocompleteHandlers, commandHandlers, componentHandlers, modalHandlers } from "./registry";

const ORIGINAL_ENV = { ...process.env };

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

let keyPair: CryptoKeyPair;
let publicKeyHex: string;

async function sign(timestamp: string, body: string): Promise<string> {
  const signature = await crypto.subtle.sign("Ed25519", keyPair.privateKey, new TextEncoder().encode(timestamp + body));
  return toHex(signature);
}

async function signedRequest(body: object, opts?: { timestamp?: string; signatureOverride?: string }) {
  const timestamp = opts?.timestamp ?? String(Math.floor(Date.now() / 1000));
  const raw = JSON.stringify(body);
  const signature = opts?.signatureOverride ?? (await sign(timestamp, raw));
  return new Request("https://example.com/api/discord/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Signature-Ed25519": signature,
      "X-Signature-Timestamp": timestamp,
    },
    body: raw,
  });
}

beforeEach(async () => {
  keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const rawPublicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  publicKeyHex = toHex(rawPublicKey);
  process.env = { ...ORIGINAL_ENV, DISCORD_PUBLIC_KEY: publicKeyHex };
  delete process.env.DISCORD_REQUIRED_ROLE_ID;
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  for (const key of Object.keys(commandHandlers)) delete commandHandlers[key];
  for (const key of Object.keys(componentHandlers)) delete componentHandlers[key];
  for (const key of Object.keys(modalHandlers)) delete modalHandlers[key];
  for (const key of Object.keys(autocompleteHandlers)) delete autocompleteHandlers[key];
});

describe("POST /api/discord/interactions", () => {
  it("rejects an unsigned request with 401", async () => {
    const req = new Request("https://example.com/api/discord/interactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: 1 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("rejects a request with a tampered signature with 401", async () => {
    const req = await signedRequest({ type: 1 }, { signatureOverride: "00".repeat(64) });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  // Regression coverage: malformed (not just tampered-but-valid-shape)
  // signature headers must produce the ordinary 401, never an uncaught 500
  // from a crypto-layer throw.
  it("rejects a 1-char signature header with 401", async () => {
    const req = await signedRequest({ type: 1 }, { signatureOverride: "a" });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("rejects an odd-length signature header with 401", async () => {
    const timestamp = "1699999999";
    const raw = JSON.stringify({ type: 1 });
    const fullSignature = await sign(timestamp, raw);
    const req = await signedRequest({ type: 1 }, { timestamp, signatureOverride: fullSignature.slice(0, -1) });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("rejects a well-formed but wrong-length hex signature (32 bytes) with 401", async () => {
    const req = await signedRequest({ type: 1 }, { signatureOverride: "ab".repeat(32) });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("rejects non-hex garbage in the signature header with 401", async () => {
    const req = await signedRequest({ type: 1 }, { signatureOverride: "zz".repeat(64) });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("rejects a validly-signed but stale timestamp with 401 (replay guard)", async () => {
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const req = await signedRequest({ type: 1 }, { timestamp: staleTimestamp });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("rejects a non-numeric timestamp with 401", async () => {
    const req = await signedRequest({ type: 1 }, { timestamp: "not-a-number" });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("answers a signed PING with {type: 1}", async () => {
    const req = await signedRequest({ type: 1 });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ type: 1 });
  });

  it("never gates PING, even when a role is required and no member is attached", async () => {
    process.env.DISCORD_REQUIRED_ROLE_ID = "role-1";
    const req = await signedRequest({ type: 1 });

    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({ type: 1 });
  });

  it("returns 500 (not 401) when DISCORD_PUBLIC_KEY is missing", async () => {
    delete process.env.DISCORD_PUBLIC_KEY;
    const req = await signedRequest({ type: 1 });

    const res = await POST(req);

    expect(res.status).toBe(500);
  });

  it("denies a command from a member without the required role, ephemerally", async () => {
    process.env.DISCORD_REQUIRED_ROLE_ID = "role-1";
    commandHandlers.ping = async () => ({ type: 4, data: { content: "should not run" } });
    const req = await signedRequest({
      type: 2,
      id: "i1",
      application_id: "a1",
      token: "t1",
      data: { name: "ping" },
      member: { user: { id: "u1" }, roles: ["role-2"] },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.embeds[0].description).toContain("FPL Better");
  });

  it("denies a DM (no member field) when a role is required", async () => {
    process.env.DISCORD_REQUIRED_ROLE_ID = "role-1";
    commandHandlers.ping = async () => ({ type: 4, data: { content: "should not run" } });
    const req = await signedRequest({
      type: 2,
      id: "i1",
      application_id: "a1",
      token: "t1",
      data: { name: "ping" },
      user: { id: "u1" },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.data.embeds[0].description).toContain("FPL Better");
  });

  it("allows a command from a member with the required role", async () => {
    process.env.DISCORD_REQUIRED_ROLE_ID = "role-1";
    commandHandlers.ping = async () => ({ type: 4, data: { content: "pong" } });
    const req = await signedRequest({
      type: 2,
      id: "i1",
      application_id: "a1",
      token: "t1",
      data: { name: "ping" },
      member: { user: { id: "u1" }, roles: ["role-1"] },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({ type: 4, data: { content: "pong" } });
  });

  it("allows any member when no role is required", async () => {
    commandHandlers.ping = async () => ({ type: 4, data: { content: "pong" } });
    const req = await signedRequest({
      type: 2,
      id: "i1",
      application_id: "a1",
      token: "t1",
      data: { name: "ping" },
      member: { user: { id: "u1" }, roles: [] },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({ type: 4, data: { content: "pong" } });
  });

  it("responds with an ephemeral unknown-interaction error for an unregistered command", async () => {
    const req = await signedRequest({
      type: 2,
      id: "i1",
      application_id: "a1",
      token: "t1",
      data: { name: "nonexistent" },
      member: { user: { id: "u1" }, roles: [] },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.embeds[0].description).toContain("Unknown interaction");
  });

  it("routes a message-component interaction to a handler by custom_id prefix", async () => {
    componentHandlers.bet = async (interaction) => ({
      type: 4,
      data: { content: `handled ${interaction.data?.custom_id}` },
    });
    const req = await signedRequest({
      type: 3,
      id: "i1",
      application_id: "a1",
      token: "t1",
      data: { custom_id: "bet:42:-1:ARS" },
      member: { user: { id: "u1" }, roles: [] },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({ type: 4, data: { content: "handled bet:42:-1:ARS" } });
  });

  it("routes a modal-submit interaction to a handler by custom_id prefix", async () => {
    modalHandlers.bet_amount = async () => ({ type: 4, data: { content: "submitted" } });
    const req = await signedRequest({
      type: 5,
      id: "i1",
      application_id: "a1",
      token: "t1",
      data: { custom_id: "bet_amount:42:-1", components: [] },
      member: { user: { id: "u1" }, roles: [] },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({ type: 4, data: { content: "submitted" } });
  });

  it("routes an autocomplete interaction to its own handler, by command name", async () => {
    autocompleteHandlers.flex = async () => ({ type: 8, data: { choices: [{ name: "Doug", value: "doug-na1" }] } });
    const req = await signedRequest({
      type: 4,
      data: { name: "flex", options: [{ name: "player", value: "do", focused: true }] },
      member: { user: { id: "u1" }, roles: [] },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: 8, data: { choices: [{ name: "Doug", value: "doug-na1" }] } });
  });

  it("answers an autocomplete with no choices, never a message, when it is gated or unknown", async () => {
    // A message body in reply to an autocomplete is malformed to Discord —
    // the picker just never fills in. An empty list is the only honest "no".
    const unknown = await POST(await signedRequest({ type: 4, data: { name: "nope", options: [] }, member: { user: { id: "u1" }, roles: [] } }));
    expect(await unknown.json()).toEqual({ type: 8, data: { choices: [] } });

    process.env.DISCORD_REQUIRED_ROLE_ID = "role-1";
    autocompleteHandlers.flex = async () => ({ type: 8, data: { choices: [{ name: "Doug", value: "doug-na1" }] } });
    const gated = await POST(await signedRequest({ type: 4, data: { name: "flex", options: [] }, member: { user: { id: "u1" }, roles: [] } }));
    expect(await gated.json()).toEqual({ type: 8, data: { choices: [] } });
  });
});
