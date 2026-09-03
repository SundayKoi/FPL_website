"use server";

// Thin Next.js adapters; validation and transitions stay in server.ts.
//
// Every action RETURNS its outcome rather than throwing. A thrown error
// crosses the server-action boundary as React's masked "an error occurred
// in the Server Components render" in production, which hides the one
// sentence the player needed ("seat is taken", "stack over the cap"). So
// the refusal travels as data, and anything unexpected is logged here
// where the Vercel log can see it and returned with its message.

import { act, createTable, ShowdownActionError, sitDown, standUp, syncTable, type TableView } from "./server";

export type ShowdownResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function run<T>(what: string, work: () => Promise<T>): Promise<ShowdownResult<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof ShowdownActionError) return { ok: false, error: error.message };
    // The raw message is for the log, not the felt: a Postgres constraint
    // name tells a player nothing and reads as broken.
    console.error(`showdown: ${what} failed`, error);
    return { ok: false, error: "Something went wrong on our side — try that again in a moment." };
  }
}

export async function createShowdownTableAction(input: unknown): Promise<ShowdownResult<number>> {
  return run("createTable", () => createTable(input));
}

export async function sitDownAction(input: unknown): Promise<ShowdownResult<TableView>> {
  return run("sitDown", () => sitDown(input));
}

export async function standUpAction(input: unknown): Promise<ShowdownResult<{ left: boolean; view: TableView }>> {
  return run("standUp", () => standUp(input));
}

export async function showdownActAction(input: unknown): Promise<ShowdownResult<TableView>> {
  return run("act", () => act(input));
}

export async function syncShowdownTableAction(input: unknown): Promise<ShowdownResult<TableView>> {
  return run("syncTable", () => syncTable(input));
}
